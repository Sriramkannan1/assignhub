const fs = require('fs');
const files = [
  'admin-assignments.html',
  'admin-submissions.html',
  'admin-students.html',
  'admin-registrations.html'
];
for(let file of files) {
  let p = 'frontend/' + file;
  let content = fs.readFileSync(p, 'utf8');
  content = content.replace(/<tbody class=\"divide-y divide-gray-50\">[\s\S]*?<\/tbody>/g, '<tbody class=\"divide-y divide-gray-50\"></tbody>');
  fs.writeFileSync(p, content);
  console.log('Fixed ' + file);
}
