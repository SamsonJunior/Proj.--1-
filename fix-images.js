// One-off fix: corrects 3 image_path values that don't match the actual
// files in public/img/tailors/. Safe to run once — only updates rows
// where the old (wrong) filename is still present.
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, 'data', 'tailoring.db');
const db = new DatabaseSync(DB_PATH);

const fixes = [
  { wrong: '/img/tailors/aliyu2.jpg', correct: '/img/tailors/aliyu-photo.jpg' },
  { wrong: '/img/tailors/amina2.jpg', correct: '/img/tailors/amina-photo.jpg' },
  { wrong: '/img/tailors/emeka2.jpg', correct: '/img/tailors/emeka-photo.jpg' },
];

for (const f of fixes) {
  const result = db.prepare('UPDATE designs SET image_path = ? WHERE image_path = ?').run(f.correct, f.wrong);
  console.log(`${f.wrong} -> ${f.correct} (${result.changes} row updated)`);
}

console.log('Done.');
