export const formatNotesAsHTML = (notesObj) => {
  let html = "";
  Object.entries(notesObj).forEach(([section, items]) => {
    if (!items || (Array.isArray(items) && items.length === 0)) return;
    
    html += `<h3>${section}</h3>`;
    
    if (typeof items === "string") {
      if (section === "Assessment and Plan") {
        items.split("\n").forEach(line => {
          if (line.trim()) html += `<p>${line.trim()}</p>`;
        });
      } else {
        html += `<p>${items}</p>`;
      }
    } else if (Array.isArray(items)) {
      html += "<ul>";
      items.forEach((item) => {
        html += `<li>${item.text}</li>`;
      });
      html += "</ul>";
    } else if (typeof items === "object") {
      Object.entries(items).forEach(([key, value]) => {
        html += `<p><strong>${key}:</strong> ${typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value}</p>`;
      });
    }
  });
  return html;
};

export const parseHTMLToNotes = (html) => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  const newNotes = {};
  let currentSection = null;
  let currentContent = [];

  const processNode = (node) => {
    if (node.tagName === 'H3') {
      if (currentSection && currentContent.length > 0) {
        if (currentContent.every(c => typeof c === 'object' && c.text)) {
          newNotes[currentSection] = currentContent;
        } else if (currentSection === "Assessment and Plan") {
          newNotes[currentSection] = currentContent.join("\n");
        } else {
          newNotes[currentSection] = currentContent.join(" ");
        }
        currentContent = [];
      }
      currentSection = node.textContent.trim();
    } else if (node.tagName === 'P' && currentSection) {
      currentContent.push(node.textContent.trim());
    } else if (node.tagName === 'UL' && currentSection) {
      const items = Array.from(node.querySelectorAll('li')).map(li => ({
        text: li.textContent.trim()
      }));
      newNotes[currentSection] = items;
      currentContent = [];
    }
  };

  Array.from(tempDiv.children).forEach(processNode);

  if (currentSection && currentContent.length > 0) {
    if (currentContent.every(c => typeof c === 'object' && c.text)) {
      newNotes[currentSection] = currentContent;
    } else if (currentSection === "Assessment and Plan") {
      newNotes[currentSection] = currentContent.join("\n");
    } else {
      newNotes[currentSection] = currentContent.join(" ");
    }
  }

  return newNotes;
};