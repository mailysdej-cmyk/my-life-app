import { start } from './app.js';

start().catch((e) => {
  const box = document.createElement('div');
  box.className = 'login';
  box.innerHTML = '<div class="card"><b>Oups, l’appli n’a pas pu démarrer.</b><p class="small" style="margin-top:8px"></p><button class="btn block" style="margin-top:12px">Réessayer</button></div>';
  box.querySelector('p').textContent = e && e.message ? e.message : String(e);
  box.querySelector('button').addEventListener('click', () => location.reload());
  document.getElementById('app').replaceChildren(box);
});
