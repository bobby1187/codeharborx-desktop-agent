window.harborDialog.details().then(details => {
  document.documentElement.dataset.theme = details.theme === 'light' ? 'light' : 'dark';
  document.querySelector('#dialogTitle').textContent = details.title;
  document.querySelector('#dialogDetail').textContent = details.detail;
  document.querySelector('#dialogCancel').focus();
});
for (const id of ['dialogClose', 'dialogCancel']) document.querySelector('#'+id).onclick = () => window.harborDialog.answer(false);
document.querySelector('#dialogConfirm').onclick = () => window.harborDialog.answer(true);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') window.harborDialog.answer(false);
  if (event.key === 'Tab') {
    const controls = [...document.querySelectorAll('button')];
    const index = controls.indexOf(document.activeElement);
    const next = (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
    event.preventDefault(); controls[next].focus();
  }
});
