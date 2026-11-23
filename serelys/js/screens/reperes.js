import { html, useState } from '../../vendor/preact-htm.js';
import { Icon, Sheet, Field, Input, Seg, euro } from '../ui.js';
import { rotation, currentPost, THEMES } from '../posts.js';

// Mes repères : un écran de consultation, sans cases à cocher. Le contenu est dans ma base.
export function Reperes({ S, all, act }) {
  const { config, settings } = all.ctx;
  const doc = S.reperes?.find((r) => r.id === 'main');
  return html`
    <div class="card">
      <h2><${Icon} name="euro" size=${20} /> Mes prix</h2>
      ${Object.values(config.plans).map((p) => html`<div class="kv"><span>${p.label}</span><b>${euro(p.price)} / mois</b></div>`)}
      <div class="kv"><span>Tâche ajoutée</span><b>${euro(config.addonPrice)} / mois</b></div>
    </div>
    ${doc?.sections?.length ? doc.sections.map((sec) => html`<div class="card">
      <h2>${sec.title}</h2>
      ${(sec.items || []).map((x) => html`<p style="margin-top:8px">${x}</p>`)}
    </div>`) : html`<div class="card"><p class="small muted">Mes chiffres, mes règles d’écriture et mes phrases signature arrivent avec le fichier privé à coller dans Supabase.</p></div>`}
    <button class="btn block" onClick=${() => act.openSettings('posts')}><${Icon} name="edit" /> Ma banque de posts (${S.posts.filter((p) => !p.deleted).length})</button>
    <p class="small muted center" style="margin-top:10px">Objectif : ${settings.goalClients} clientes au plus vite, puis ${settings.goalClients2}.</p>`;
}

// Ma banque de posts : ceux du mardi, dans l'ordre de rotation. Je peux en ajouter et les modifier.
export function Posts({ S, act }) {
  const [edit, setEdit] = useState(undefined);
  const list = rotation(S.posts);
  const cur = currentPost(S.posts, S.settings.postCursor || 0);
  return html`
    <p class="small muted" style="margin:0 6px 14px">Le mardi, ma fiche affiche le post de la semaine. « Publié » passe au suivant, en alternant « Le temps » et « Directrices ».</p>
    <button class="btn primary block" style="margin-bottom:16px" onClick=${() => setEdit(null)}><${Icon} name="plus" /> Ajouter un post</button>
    ${list.map((p) => html`<button class="card client-card flat" style="padding:14px 16px;margin-bottom:12px" onClick=${() => setEdit(p)}>
      <div class="spread"><b>Post ${p.num} · ${p.title}</b>${cur?.post.id === p.id ? html`<span class="chip sage">Cette semaine</span>` : null}</div>
      <div class="small muted" style="margin-top:4px">${THEMES[p.theme] || 'Le temps'}</div>
    </button>`)}
    ${!list.length ? html`<div class="empty">Pas encore de post.</div>` : null}
    ${edit !== undefined ? html`<${PostSheet} p=${edit} next=${Math.max(0, ...S.posts.map((x) => x.num || 0)) + 1} onClose=${() => setEdit(undefined)}
      onDelete=${async () => { await act.store.remove('post', edit.id); setEdit(undefined); }}
      onSave=${async (p) => { await act.store.put('post', edit?.id || act.uid(), { ...p, id: undefined }); setEdit(undefined); act.say('Post enregistré'); }} />` : null}`;
}

function PostSheet({ p, next, onClose, onSave, onDelete }) {
  const [v, setV] = useState({ num: next, theme: 'temps', title: '', text: '', image: '', ...(p || {}) });
  const set = (k) => (x) => setV({ ...v, [k]: x });
  return html`<${Sheet} title=${p ? `Post ${p.num}` : 'Nouveau post'} onClose=${onClose}>
    <${Field} label="Titre"><${Input} value=${v.title} onChange=${set('title')} /></${Field}>
    <${Field} label="Thème"><${Seg} value=${v.theme} onChange=${set('theme')} options=${Object.entries(THEMES)} /></${Field}>
    <${Field} label="Numéro (ordre dans son thème)"><${Input} type="number" min="1" value=${v.num} onChange=${(x) => set('num')(Number(x) || 1)} /></${Field}>
    <${Field} label="Texte du post"><textarea class="input" style="min-height:220px" value=${v.text} onInput=${(e) => set('text')(e.target.value)}></textarea></${Field}>
    <${Field} label="Idée d’image (pour ChatGPT)"><textarea class="input" value=${v.image} onInput=${(e) => set('image')(e.target.value)}></textarea></${Field}>
    <button class="btn primary block" disabled=${!v.title.trim() || !v.text.trim()} onClick=${() => onSave({ ...v, title: v.title.trim() })}>Enregistrer</button>
    ${p ? html`<button class="btn ghost block" style="margin-top:8px" onClick=${onDelete}>Supprimer ce post</button>` : null}
  </${Sheet}>`;
}

// Le post de la semaine, sur la fiche du mardi : replié par défaut
export function PostBox({ S, act, t }) {
  const [open, setOpen] = useState(false);
  const cur = currentPost(S.posts, S.settings.postCursor || 0);
  if (!cur) return html`<div class="small muted" style="margin-top:10px">Ma banque de posts est vide : Réglages › Mes repères › Ma banque de posts.</div>`;
  const { post } = cur;
  return html`<div onClick=${(e) => e.stopPropagation()}>
    <div class="small" style="margin-top:8px"><b>Post ${post.num} · ${post.title}</b> <span class="muted">(${THEMES[post.theme] || 'Le temps'})</span></div>
    ${!open ? html`<button class="btn small" style="margin-top:10px" onClick=${() => setOpen(true)}>Voir le post</button>` : html`<div class="t-detail">
      <p style="white-space:pre-wrap">${post.text}</p>
      ${post.image ? html`<p class="small muted" style="margin-top:8px"><b>Idée d’image :</b> ${post.image}</p>` : null}
      <div class="row wrap" style="margin-top:10px">
        <button class="btn small" onClick=${() => act.copy(post.text, 'Texte copié')}>Copier le texte</button>
        ${post.image ? html`<button class="btn small" onClick=${() => act.copy(post.image, 'Idée d’image copiée')}>Copier l’idée d’image</button>` : null}
        ${!t.done ? html`<button class="btn small primary" onClick=${() => act.publishPost(t)}><${Icon} name="check" size=${16} stroke=${2.6} /> Publié</button>` : null}
        <button class="btn small ghost" onClick=${() => setOpen(false)}>Replier</button>
      </div></div>`}
  </div>`;
}
