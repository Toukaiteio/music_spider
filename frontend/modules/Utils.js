// Helper function to convert File to base64 string (data part only)
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64String = reader.result;
      // Remove the prefix 'data:*/*;base64,'
      const parts = base64String.split(',');
      if (parts.length === 2) {
        resolve(parts[1]);
      } else {
        // Handle cases where the prefix might be missing or different, though unlikely for standard files
        console.warn("Base64 string prefix not found or in unexpected format. Resolving with full string.");
        resolve(base64String); // Fallback, though backend might not like this
      }
    };
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}

// Helper function to get file extension without dot, in lowercase
export function getFileExtension(filename) {
  if (!filename || typeof filename !== 'string') {
    return '';
  }
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1 || lastDot === filename.length - 1) {
    // No extension or filename ends with a dot
    return '';
  }
  return filename.substring(lastDot + 1).toLowerCase();
}

// Helper function to slice a file into Blob chunks
export function sliceFile(file, chunkSize) {
    const chunks = [];
    let offset = 0;
    while (offset < file.size) {
        const chunk = file.slice(offset, offset + chunkSize);
        chunks.push(chunk);
        offset += chunkSize;
    }
    return chunks;
}
