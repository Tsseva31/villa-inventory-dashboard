const express = require('express');
const path = require('path');

const app = express();
const root = __dirname;

app.use(express.static(root));

app.get('*', (req, res) => {
  res.sendFile(path.join(root, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Villa Dashboard running on port ' + PORT);
});
