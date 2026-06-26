const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  const scriptRegex = /<\/script>\s*(?=\/\/ (Admin|Student|Auth|App))/;
  if (scriptRegex.test(content) && content.includes('</body>')) {
      content = content.replace(scriptRegex, ""); // Remove the misplaced </script>
      content = content.replace(/<\/body>/, "</script>\n</body>"); // Insert it before </body>
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Fixed:', file);
  }
});
