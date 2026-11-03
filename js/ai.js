/* ai.js — pemanggil Gemini / Groq langsung dari browser (pakai API key milik pengguna) */
(function (g) {
  'use strict';

  function buildPrompt(context, kind) {
    var adobe = Object.keys(Core.ADOBE_CATEGORIES).map(function (k) { return k + '=' + Core.ADOBE_CATEGORIES[k]; }).join(', ');
    var ss = Core.SS_CATEGORIES.join(', ');
    var what = kind === 'video'
      ? 'The images are 3 frames (start, middle, end) taken from ONE short video clip. Describe the clip and its motion/animation, not the individual frames.'
      : 'The image is one microstock asset.';
    return [
      'You are an expert microstock metadata writer for Adobe Stock and Shutterstock.',
      what,
      'Creator context for this batch (may be empty): ' + (context && context.trim() ? context.trim() : 'none'),
      '',
      'Write in English. Rules:',
      '- title: one clear, descriptive phrase, 8-15 words, max 70 characters is ideal (hard max 200). No trailing period.',
      '- description: one or two natural sentences, max 200 characters.',
      '- keywords: 30-45 single words or short phrases, most relevant first (the first 10 matter most), covering subject, concept, style, mood, color, use. No duplicates.',
      '- Do not use brand names, trademarks, real people names, or the word "stock".',
      '- Only describe what is visible. Do not invent details.',
      '',
      'Adobe Stock category ids: ' + adobe + '.',
      'Shutterstock categories (pick 1-2 exactly as written): ' + ss + '.',
      '',
      'Reply with ONLY a JSON object, no markdown:',
      '{"title": string, "description": string, "keywords": string[], "category": integer, "ss_categories": string[]}'
    ].join('\n');
  }

  function parseJson(text) {
    var t = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    var a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b <= a) throw new Error('Respon AI bukan JSON');
    return JSON.parse(t.slice(a, b + 1));
  }

  async function failFrom(res) {
    var msg = 'HTTP ' + res.status;
    try {
      var j = await res.json();
      if (j && j.error && j.error.message) msg = j.error.message;
    } catch (e) { /* abaikan */ }
    var err = new Error(msg);
    err.status = res.status;
    return err;
  }

  async function callGemini(opt, prompt) {
    var parts = [{ text: prompt }].concat(opt.frames.map(function (f) {
      return { inline_data: { mime_type: 'image/jpeg', data: f.split(',')[1] } };
    }));
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(opt.model) + ':generateContent?key=' + encodeURIComponent(opt.key);
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: parts }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.4 }
      })
    });
    if (!res.ok) throw await failFrom(res);
    var data = await res.json();
    var c = data.candidates && data.candidates[0];
    var text = c && c.content && c.content.parts ? c.content.parts.map(function (p) { return p.text || ''; }).join('') : '';
    if (!text) {
      var why = (data.promptFeedback && data.promptFeedback.blockReason) || (c && c.finishReason) || 'kosong';
      throw new Error('Respon AI kosong/diblokir: ' + why);
    }
    return text;
  }

  async function callGroq(opt, prompt) {
    var content = [{ type: 'text', text: prompt }].concat(opt.frames.map(function (f) {
      return { type: 'image_url', image_url: { url: f } };
    }));
    var res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + opt.key },
      body: JSON.stringify({
        model: opt.model,
        messages: [{ role: 'user', content: content }],
        response_format: { type: 'json_object' },
        temperature: 0.4
      })
    });
    if (!res.ok) throw await failFrom(res);
    var data = await res.json();
    var text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('Respon AI kosong');
    return text;
  }

  /* opt: {provider, key, model, frames:[dataUrl], context, kind} */
  async function generate(opt) {
    var prompt = buildPrompt(opt.context, opt.kind);
    var text = opt.provider === 'groq' ? await callGroq(opt, prompt) : await callGemini(opt, prompt);
    var meta = Core.normalizeMeta(parseJson(text));
    if (!meta.title) throw new Error('AI tidak menghasilkan judul');
    return meta;
  }

  g.AI = { generate: generate, buildPrompt: buildPrompt, parseJson: parseJson };
})(globalThis);
