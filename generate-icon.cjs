const fs = require('fs');
const path = require('path');
const https = require('https');

const dir = path.join(__dirname, 'src', 'components');
const dest = path.join(dir, 'icon.png');

// Create directory recursively if it doesn't exist
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// A valid, 1x1 pixel base64 PNG. This acts as a reliable fallback.
const fallbackBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function writeFallback(reason) {
  try {
    fs.writeFileSync(dest, Buffer.from(fallbackBase64, 'base64'));
    console.log(`Successfully generated fallback placeholder icon at src/components/icon.png (Reason: ${reason})`);
  } catch (err) {
    console.error('Critical error creating fallback icon:', err.message);
  }
}

console.log('Attempting to fetch a beautiful launcher icon for FluxList AI...');

// Try to download a beautiful preset icon, with a strict 3-second timeout
const req = https.get('https://picsum.photos/512/512', (res) => {
  if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
    // Handle redirect
    https.get(res.headers.location, (redirectRes) => {
      const file = fs.createWriteStream(dest);
      redirectRes.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log('Successfully downloaded app icon from Picsum.');
      });
      file.on('error', (err) => {
        file.close();
        writeFallback(err.message);
      });
    }).on('error', (err) => {
      writeFallback(err.message);
    });
  } else if (res.statusCode === 200) {
    const file = fs.createWriteStream(dest);
    res.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log('Successfully downloaded standard app icon.');
    });
    file.on('error', (err) => {
      file.close();
      writeFallback(err.message);
    });
  } else {
    writeFallback(`Status code ${res.statusCode}`);
  }
});

req.on('error', (err) => {
  writeFallback(err.message);
});

req.setTimeout(3000, () => {
  req.destroy();
  writeFallback('Network request timed out');
});
