const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

app.use(cors());

// Serve the databases directly
app.use('/databases', express.static(path.join(__dirname, 'databases')));

// Endpoint to list all databases
app.get('/api/databases', (req, res) => {
  const dbDir = path.join(__dirname, 'databases');
  if (!fs.existsSync(dbDir)) return res.json([]);
  const files = fs.readdirSync(dbDir).filter(f => f.endsWith('.json'));
  res.json(files);
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
