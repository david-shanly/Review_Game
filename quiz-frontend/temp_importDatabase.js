document.getElementById('import-json-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function () {
    try {
      const parsed = JSON.parse(reader.result);
      if (parsed && typeof parsed === 'object') {
        loadSavedDB(parsed);
        saveDB();
        triggerAlert('SYSTEM', 'Database imported successfully.', 'gain');
      }
    } catch (err) {
      console.error(err);
      triggerAlert('ERROR', 'Invalid JSON file.', 'loss');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
});
