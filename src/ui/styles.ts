export const styles = `
  :host { display:block; color:var(--wallet-check-text,#19332d); font:14px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif; }
  * { box-sizing:border-box; }
  [hidden] { display:none!important; }
  .panel { background:var(--wallet-check-background,#fff); border:1px solid #dce8e1; border-radius:20px; padding:28px; max-width:720px; margin:auto; box-shadow:0 12px 42px #1a493208; }
  header { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:20px; }
  .mark { width:44px; height:44px; flex-shrink:0; display:grid; place-items:center; border-radius:13px; background:#e9f5ec; color:var(--wallet-check-accent,#226c4a); font-size:28px; }
  h2 { font-size:21px; letter-spacing:-.5px; margin:0; }
  header p { color:#72827a; margin:2px 0 0; font-size:12px; }
  .configuration { display:flex; gap:6px; flex-wrap:wrap; margin-left:auto; max-width:100%; justify-content:flex-end; }
  .configuration span { color:#327754; background:#eff7f1; padding:4px 9px; border-radius:7px; font-size:12px; font-weight:600; overflow-wrap:anywhere; min-width:0; }
  .drop { cursor:pointer; border:1.5px dashed #bfd3c6; border-radius:12px; background:#f8fbf8; display:flex; align-items:center; flex-direction:column; gap:5px; padding:30px 15px; transition:background .15s; }
  .drop:hover { background:#eff7ef; }
  .upload-icon { font-size:26px; color:#40745a; line-height:1; margin-bottom:8px; }
  .drop strong { font-weight:600; }
  .drop span:not(.upload-icon),small { color:#76837b; font-size:12px; }
  small { margin-top:8px; font-size:11px; }
  #preview { margin-top:18px; text-align:center; background:#f6f8f5; border-radius:10px; padding:12px; }
  .image-stage { display:inline-block; max-width:100%; position:relative; line-height:0; touch-action:none; user-select:none; cursor:crosshair; }
  img { display:block; max-width:100%; max-height:min(300px,30dvh); width:auto; height:auto; }
  .selection { position:absolute; border:2px solid #216d48; background:#4fbd6626; pointer-events:none; }
  .crop-tools { display:flex; align-items:center; gap:10px; justify-content:space-between; margin-top:10px; text-align:left; }
  .crop-tools span { font-size:11px; color:#76837b; }
  button { font:inherit; cursor:pointer; border:1px solid #d2dfd6; color:inherit; background:white; border-radius:8px; padding:9px 15px; transition:opacity .15s; }
  button:disabled { opacity:.45; cursor:not-allowed; }
  button:focus-visible,.drop:focus-visible { outline:3px solid #86b99b; outline-offset:3px; }
  #crop { font-size:12px; padding:5px 9px; white-space:nowrap; }
  .actions { display:flex; gap:10px; margin-top:20px; flex-wrap:wrap; }
  #verify,#confirm { background:var(--wallet-check-accent,#226c4a); color:#fff; border-color:transparent; font-weight:600; }
  #status { margin-top:16px; padding:12px 14px; background:#f3f7f3; border-radius:8px; font-size:12px; overflow-wrap:anywhere; }
  #status[data-error="true"] { background:#fff2ed; color:#a14930; white-space:pre-line; }
  #metadata { margin-top:12px; padding:10px 14px; background:#f3f7f3; border-radius:8px; font-size:12px; overflow-wrap:anywhere; }
  #metadata p { display:grid; grid-template-columns:3em 18px minmax(0,1fr); align-items:baseline; gap:6px; margin:8px 0; }
  :host([lang="en"]) #metadata p { grid-template-columns:5.5em 18px minmax(0,1fr); }
  #metadata p > span:first-child { white-space:nowrap; }
  .check-icon { color:#b42318; font-size:14px; font-weight:700; text-align:center; }
  [data-passed="true"] .check-icon { color:#21804a; }
  .check-detail { min-width:0; overflow-wrap:anywhere; }
  #result { margin-top:14px; }
  code { overflow-wrap:anywhere; font:inherit; font-family:ui-monospace,monospace; user-select:all; }
  @media(max-height:800px) {
    .panel { padding:18px; }
    header { margin-bottom:12px; }
    .actions { margin-top:12px; }
    #status,#metadata { margin-top:10px; padding:10px 12px; }
    #result { margin-top:10px; }
  }
  @media(max-width:480px) { .panel { padding:18px; border-radius:14px; } h2 { font-size:19px; } }
`;
