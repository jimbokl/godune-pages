// Shared, optional detail for both dated bus and railway setup.
// Disclosure state belongs to the form, never to the traveller's saved trip.
export function wizardTravelDate(value) {
  return value ? new Intl.DateTimeFormat('ru-RU', {day:'numeric', month:'long', year:'numeric', timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')) : 'выберите дату';
}
export function wizardAccessUI() {
  const opened = new Map();
  const node = (tag, text) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    return element;
  };
  function remember(mount) {
    for (const details of mount.querySelectorAll('[data-wizard-access]')) {
      opened.set(details.dataset.wizardAccess, details.open);
    }
  }
  function create({id, kind, fields, note, status}) {
    const details = node('details');
    details.className = 'wizard-access-settings';
    details.dataset.wizardAccess = id;
    details.open = opened.get(id) === true;
    const summary = node('summary');
    const title = node('strong', 'Дорога и запас времени');
    const hint = node('span');
    hint.className = 'wizard-access-status';
    hint.setAttribute('aria-live', 'polite');
    const update = () => { hint.textContent = status(); };
    summary.append(title, hint);
    details.append(summary);
    const group = node('div');
    group.className = 'wizard-fields wizard-access-fields';
    for (const field of fields) {
      const label = node('label', field.caption);
      const input = node('input');
      input.type = 'number';
      input.min = '0';
      input.max = '1440';
      input.step = '1';
      input.inputMode = 'numeric';
      input.required = field.required === true;
      input.disabled = field.disabled === true;
      input.value = field.value ?? '';
      input.placeholder = 'Пока не знаю';
      input.dataset[kind === 'bus' ? 'wizardBusField' : 'wizardRailField'] = field.key;
      input.addEventListener('input', event => {
        event.stopPropagation();
        field.change(input.value === '' ? null : Number(input.value));
        update();
      });
      input.addEventListener('invalid', () => {
        details.open = true;
        opened.set(id, true);
        const transport = details.closest('[data-wizard-transport]');
        if (transport) transport.open = true;
      });
      label.append(input);
      group.append(label);
    }
    details.append(group, node('p', note));
    details.addEventListener('toggle', () => { if (details.isConnected) opened.set(id, details.open); });
    update();
    return details;
  }
  return {remember, create};
}
