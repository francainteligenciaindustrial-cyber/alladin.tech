// Grava no banco as fotos importadas (mural + equipe). Chamado por importar-fotos.ps1.
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8').replace(/^﻿/, ''));
const db = new DatabaseSync(process.argv[3]);
const get = (k, d) => { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k); try { return r ? JSON.parse(r.value) : d; } catch { return d; } };
const set = (k, v) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, JSON.stringify(v));
const wall = [].concat(data.wall || []).filter(Boolean);
if (wall.length) set('wall_photos', [...wall, ...get('wall_photos', [])].slice(0, 60));
if (data.team) set('team_photo', data.team);
console.log(`\nPronto: ${wall.length} foto(s) no mural${data.team ? ' + foto da equipe' : ''}. Atualize o site (Ctrl+F5).`);
