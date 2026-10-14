const STORE_KEY = 'godune.realty.cosmosStay.v1';
const checks = [...document.querySelectorAll('[data-check]')];
const form = document.querySelector('[data-brief]');
const status = document.querySelector('[data-save-state]');
const read = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; } };
const write = (value) => localStorage.setItem(STORE_KEY, JSON.stringify({ ...read(), ...value, updatedAt: new Date().toISOString() }));
const briefValue = () => Object.fromEntries([...form.elements].filter((field) => field.name).map((field) => [field.name, field.value.trim()]));
const checklistValue = () => Object.fromEntries(checks.map((field) => [field.dataset.check, field.checked]));
const saveLocal = (value) => {
  try {
    write(value);
    if (status) status.textContent = `Сохранено на устройстве · ${new Date().toLocaleString('ru-RU')}`;
    return true;
  } catch {
    if (status) status.textContent = 'Не удалось сохранить: проверьте свободное место или настройки хранилища браузера.';
    return false;
  }
};
const existing = read();
for (const input of checks) input.checked = Boolean(existing.checklist?.[input.dataset.check]);
if (form) {
  for (const field of form.elements) if (field.name && existing.brief?.[field.name] != null) field.value = existing.brief[field.name];
  if (status && existing.updatedAt) status.textContent = `Сохранено на этом устройстве · ${new Date(existing.updatedAt).toLocaleString('ru-RU')}`;
  form.addEventListener('input', () => {
    if (status) status.textContent = 'Есть несохранённые изменения. Сохраните памятку на устройстве.';
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    saveLocal({ brief: briefValue() });
  });
}
for (const input of checks) input.addEventListener('change', () => {
  saveLocal({ ...(form ? { brief: briefValue() } : {}), checklist: checklistValue() });
});
const pdfButton = document.querySelector('[data-pdf]');
if (pdfButton) pdfButton.addEventListener('click', async () => {
  const buttonText = pdfButton.textContent;
  pdfButton.disabled = true;
  pdfButton.textContent = 'Готовим PDF…';
  try {
    await import(new URL('./assets/vendor/pdf/pdf-lib.js', import.meta.url));
    await import(new URL('./assets/vendor/pdf/fontkit.js', import.meta.url));
    const { PDFDocument, rgb } = window.PDFLib;
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(window.fontkit);
    const fontBytes = await fetch(new URL('./assets/vendor/pdf/Manrope-Regular.ttf', import.meta.url)).then((r) => { if (!r.ok) throw new Error('Не удалось загрузить шрифт'); return r.arrayBuffer(); });
    const font = await pdf.embedFont(fontBytes, { subset: true });
    const bold = font;
    const ink = rgb(0.09, 0.2, 0.29), sea = rgb(0.27, 0.49, 0.48), amber = rgb(0.74, 0.55, 0.28), muted = rgb(0.36, 0.43, 0.46), pale = rgb(0.91, 0.94, 0.91);
    const brief = briefValue();
    const locallySaved = saveLocal({ brief, checklist: checklistValue() });
    const canonical = JSON.parse(document.querySelector('#realty-pdf-data')?.textContent || '{}');
    const pageSize = [595.28, 841.89];
    let page = pdf.addPage(pageSize), y = 790;
    const left = 48, width = 499;
    const wrap = (text, size, maxWidth) => {
      const lines=[]; let line='';
      const splitLongWord = (word) => {
        const chunks=[]; let chunk='';
        for (const character of word) {
          if (chunk && font.widthOfTextAtSize(chunk + character,size)>maxWidth) { chunks.push(chunk); chunk=character; }
          else chunk+=character;
        }
        if(chunk) chunks.push(chunk);
        return chunks;
      };
      for (const word of String(text || '').split(/\s+/)) {
        const parts=font.widthOfTextAtSize(word,size)>maxWidth ? splitLongWord(word) : [word];
        for (const part of parts) {
          const candidate=line ? `${line} ${part}` : part;
          if(font.widthOfTextAtSize(candidate,size)>maxWidth && line){lines.push(line);line=part;}
          else line=candidate;
        }
      }
      if(line) lines.push(line); return lines;
    };
    const line = (text, size=10, color=ink, gap=15) => {
      for (const part of wrap(text,size,width)) { if(y<58){footer();page=pdf.addPage(pageSize);y=790;} page.drawText(part,{x:left,y,size,font:bold,color}); y-=gap; }
    };
    const footer = () => { page.drawLine({start:{x:left,y:39},end:{x:width+left,y:39},thickness:.6,color:pale}); page.drawText(`GoDune · памятка покупателя · проверено ${canonical.checkedAt || '—'}`,{x:left,y:25,size:8,font,color:muted}); };
    const heading = (text) => {
      const parts = wrap(text,13,width);
      if (y - (parts.length * 19 + 22) < 70) { footer(); page=pdf.addPage(pageSize); y=790; }
      y-=8;
      for (const part of parts) { page.drawText(part,{x:left,y,size:13,font,color:sea}); y-=19; }
    };
    const projectTitle = `Памятка покупателя · ${canonical.projectName || 'проект'}`;
    const titleLines = wrap(projectTitle, 15, width).slice(0, 2);
    const headerHeight = 130;
    page.drawRectangle({x:0,y:pageSize[1]-headerHeight,width:pageSize[0],height:headerHeight,color:ink});
    page.drawText('GODUNE · НЕДВИЖИМОСТЬ У МОРЯ',{x:left,y:pageSize[1]-42,size:9,font,color:rgb(0.84,0.88,0.83)});
    titleLines.forEach((part,index)=>page.drawText(part,{x:left,y:pageSize[1]-76-index*20,size:15,font,color:rgb(1,1,1)}));
    y=pageSize[1]-153;
    line('Памятка собрана из выбранных критериев и сведений из источников.',9,muted,14);
    heading('Ваши критерии');
    line(`Что проверить: ${brief.goal || 'не указано'}`);
    line(`Бюджет: ${brief.budget ? `${brief.budget} ₽` : 'не указан'}`);
    line(`Горизонт: ${brief.horizon || 'не выбран'}`);
    line(`Важное: ${brief.notes || 'не указано'}`);
    heading('Проект · сведения из источников');
    line(`${canonical.projectName || 'Проект'} · ${canonical.location || ''}`);
    for (const fact of canonical.facts || []) line(`${fact.label}: ${fact.value}`);
    for (const role of canonical.roles || []) line(`${role.name} · ${role.role}`);
    heading('Отмеченные вопросы');
    const selected=checks.filter((field)=>field.checked).map((field)=>field.closest('label')?.querySelector('strong')?.textContent).filter(Boolean);
    if(selected.length) selected.forEach((v,index)=>line(`${index+1}. ${v}`,9,ink,13)); else line('Пока ничего не отмечено.',9,muted,13);
    heading('Что пока неизвестно');
    for (const unknown of canonical.unknowns || []) line(unknown);
    line('Условия дохода: договор не опубликован.');
    heading('Сверка описаний');
    for (const claim of canonical.contrastClaims || []) {
      const value = claim.value || {};
      if (claim.id === 'developer-site-inventory') {
        line(`Сайт застройщика: ${value.apartments ?? '—'} апартамента, ${value.hotel_rooms ?? '—'} гостиничных номера; ${value.phases ?? '—'} очереди. Это другое описание проекта.`,9,ink,13);
      } else if (claim.id === 'developer-site-timeline') {
        line(`Сроки на сайте застройщика: секции ${value.section_1 ?? '—'}, ${value.section_2 ?? '—'}, ${value.section_3 ?? '—'}; гостиница ${value.hotel ?? '—'}.`,9,ink,13);
      } else if (claim.id === 'developer-site-price-indication') {
        line(`На сайте застройщика указано от ${Number(value).toLocaleString('ru-RU')} ₽/м²; это не цена Cosmos Stay и не подтверждение предложения.`,9,ink,13);
      }
    }
    line(canonical.contrast?.contrast_note || 'Сверка текущих описаний; расхождение не разрешено.',9,muted,13);
    const comparison = canonical.comparison || {};
    heading(`Сравнение · ${comparison.projectName || 'Белая Дюна'}`);
    line(`Локация: ${comparison.location || '—'}`,9,ink,13);
    line('Тип: крупный инфраструктурный проект территории; его показатели не описывают покупку отдельного гостиничного номера.',9,ink,13);
    for (const fact of comparison.facts || []) line(`${fact.label}: ${fact.value}`,9,ink,13);
    for (const role of comparison.roles || []) line(`${role.name} · ${role.role}`,9,ink,13);
    heading('Неизвестно по сравнению');
    for (const unknown of comparison.unknowns || []) line(unknown,9,ink,13);
    heading('Источники сравнения');
    for (const [index, source] of (comparison.sources || []).entries()) {
      line(`${index + 1}. ${source.title}${source.published ? ` · опубликовано ${source.published}` : ''}${source.checked ? ` · проверено ${source.checked}` : ''}: ${source.url}`,8,muted,11);
    }
    heading(`Источники · проверены ${canonical.checkedAt || '—'}`);
    for (const [index, source] of (canonical.sources || []).entries()) {
      line(`${index + 1}. ${source.title}${source.published ? ` · опубликовано ${source.published}` : ''}${source.checked ? ` · проверено ${source.checked}` : ''}: ${source.url}`,8,muted,11);
    }
    footer();
    const bytes=await pdf.save(); const blob=new Blob([bytes],{type:'application/pdf'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`godune-pamyatka-cosmos-stay-${new Date().toISOString().slice(0,10)}.pdf`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    if(status) status.textContent=locallySaved ? 'Сохранено на устройстве · PDF подготовлен' : 'PDF подготовлен · сохранить данные на устройстве не удалось';
  } catch (error) {
    if(status) status.textContent=`Не удалось создать PDF: ${error.message}`;
  } finally { pdfButton.disabled=false; pdfButton.textContent=buttonText; }
});
