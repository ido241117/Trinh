const fs = require('fs');
let content = fs.readFileSync('api.ts', 'utf8');
const lines = content.split('\n');

const insertIndex = 93;
const newFunction = [
  '',
  'export async function deleteTrack(id: string): Promise<void> {',
  '  const res = await fetch(`/api/library/${id}`, { method: "DELETE" })',
  '  if (!res.ok) {',
  '    const body = await res.json().catch(() => ({}))',
  '    throw new Error(body.error ?? "Failed to delete track")',
  '  }',
  '}',
  ''
];

lines.splice(insertIndex, 0, ...newFunction);
fs.writeFileSync('api.ts', lines.join('\n'));
console.log('Function added successfully');
