import { html, useState, useMemo } from '../../vendor/preact-htm.js';
import { Icon, Sheet, Field, Input, Switch } from '../ui.js';

// Les cartes elles-mêmes sont uniquement dans ma base (jamais dans le code).

function FlipCard({ c, onEdit, flipped, onFlip }) {
  return html`<div class=${`flip ${flipped ? 'on' : ''}`} onClick=${onFlip}>
    <div class="flip-in">
      <div class="face">
        <div class="spread" style="align-items:flex-start"><div class="q grow">${c.star ? html`<span class="star">★ </span>` : null}${c.q}</div>
          ${onEdit ? html`<button class="icon-btn" style="width:38px;height:38px" onClick=${(e) => { e.stopPropagation(); onEdit(); }} aria-label="Modifier"><${Icon} name="edit" size=${17} /></button>` : null}</div>
        <div class="small muted" style="margin-top:14px;display:flex;gap:6px;align-items:center"><${Icon} name="flip" size=${14} /> Touche pour retourner</div>
      </div>
      <div class="face back">
        <div class="lab">Ma réponse</div><div class="a">${c.a}</div>
        ${c.insist ? html`<div class="lab">Si elle insiste</div><div>${c.insist}</div>` : null}
        ${c.tip ? html`<div class="lab">Conseil</div><div class="muted" style="font-weight:700">${c.tip}</div>` : null}
      </div>
    </div></div>`;
}

export function CardsScreen({ S, act, openSettings }) {
  const [edit, setEdit] = useState(undefined);
  const [flipped, setFlipped] = useState({});
  const [train, setTrain] = useState(null);
  const cards = useMemo(() => [...S.cards].sort((a, b) => (b.star ? 1 : 0) - (a.star ? 1 : 0) || (a.order ?? 99) - (b.order ?? 99)), [S.cards]);
  const cats = [...new Set(cards.map((c) => c.cat || 'Autres'))];
  const startTrain = () => {
    const stars = cards.filter((c) => c.star).sort(() => Math.random() - 0.5);
    const rest = cards.filter((c) => !c.star).sort(() => Math.random() - 0.5);
    setTrain({ list: [...stars, ...rest], i: 0, flipped: false });
  };

  if (train) {
    const c = train.list[train.i];
    return html`<div class="screen">
      <div class="topbar"><button class="icon-btn" onClick=${() => setTrain(null)} aria-label="Quitter"><${Icon} name="back" /></button><h1 class="grow" style="font-size:22px">Entraînement</h1><span class="chip">${train.i + 1}/${train.list.length}</span></div>
      ${c ? html`
        <p class="muted" style="margin:0 6px 14px;font-weight:700">${train.flipped ? 'Compare avec ta réponse.' : 'Dis ta réponse à voix haute, puis retourne la carte.'}</p>
        <${FlipCard} c=${c} flipped=${train.flipped} onFlip=${() => setTrain({ ...train, flipped: !train.flipped })} />
        ${train.flipped ? html`<button class="btn primary block" onClick=${() => setTrain({ ...train, i: train.i + 1, flipped: false })}>Carte suivante</button>`
          : html`<button class="btn blue block" onClick=${() => setTrain({ ...train, flipped: true })}>Retourner la carte</button>`}`
      : html`<div class="card center"><h2 style="justify-content:center">Bravo, tu as fait toutes les cartes !</h2><button class="btn primary" onClick=${startTrain}>Recommencer</button></div>`}
    </div>`;
  }

  return html`<div class="screen">
    <div class="topbar"><h1>Mes réponses par cœur</h1><button class="icon-btn" onClick=${openSettings} aria-label="Réglages"><${Icon} name="gear" /></button></div>
    <div class="row" style="margin-bottom:18px">
      <button class="btn primary grow" disabled=${!cards.length} onClick=${startTrain}><${Icon} name="flip" /> Mode entraînement</button>
      <button class="btn" onClick=${() => setEdit(null)} aria-label="Ajouter une question"><${Icon} name="plus" /></button></div>
    ${!cards.length ? html`<div class="card"><div class="empty">Pas encore de cartes. Ajoute une question avec « + », ou colle le texte de départ dans Supabase (voir le mode d’emploi).</div></div>` : null}
    ${cats.map((cat) => html`<div class="section-title"><span>${cat}</span></div>
      ${cards.filter((c) => (c.cat || 'Autres') === cat).map((c) => html`<${FlipCard} key=${c.id} c=${c} flipped=${!!flipped[c.id]} onFlip=${() => setFlipped({ ...flipped, [c.id]: !flipped[c.id] })} onEdit=${() => setEdit(c)} />`)}`)}
    ${edit !== undefined ? html`<${CardSheet} c=${edit} cats=${cats} onClose=${() => setEdit(undefined)}
      onDelete=${async () => { await act.store.remove('card', edit.id); setEdit(undefined); }}
      onSave=${async (c) => { await act.store.put('card', edit?.id || act.uid(), { ...c, id: undefined, order: c.order ?? cards.length + 1 }); setEdit(undefined); act.say('Carte enregistrée'); }} />` : null}
  </div>`;
}

function CardSheet({ c, cats, onClose, onSave, onDelete }) {
  const [v, setV] = useState(c || { q: '', a: '', insist: '', tip: '', star: false, cat: cats[0] || 'Les prix' });
  const set = (k) => (x) => setV({ ...v, [k]: x });
  const area = (k) => html`<textarea class="input" value=${v[k]} onInput=${(e) => set(k)(e.target.value)}></textarea>`;
  return html`<${Sheet} title=${c ? 'Modifier la carte' : 'Nouvelle question'} onClose=${onClose}>
    <${Field} label="Question (recto)">${area('q')}</${Field}>
    <${Field} label="Ma réponse (verso)">${area('a')}</${Field}>
    <${Field} label="Si elle insiste (facultatif)">${area('insist')}</${Field}>
    <${Field} label="Conseil (facultatif)"><${Input} value=${v.tip} onChange=${set('tip')} /></${Field}>
    <${Field} label="Thème"><${Input} value=${v.cat} onChange=${set('cat')} list="cats" /></${Field}>
    <datalist id="cats">${cats.map((x) => html`<option value=${x} />`)}</datalist>
    <${Switch} label="★ Question importante (en premier)" value=${!!v.star} onChange=${set('star')} />
    <button class="btn primary block" disabled=${!v.q?.trim() || !v.a?.trim()} onClick=${() => onSave(v)}>Enregistrer</button>
    ${c ? html`<button class="btn ghost block" style="margin-top:8px" onClick=${onDelete}>Supprimer la carte</button>` : null}
  </${Sheet}>`;
}
