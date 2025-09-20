let imageData = null;
let colorGroups = [];
let displaySettings;
let generatedModel = null;
let generatedOverrideModel = null;

const dom = {
    originalCanvas: document.getElementById('originalCanvas'),
    patternCanvas: document.getElementById('patternCanvas'),
    colorMapCanvas: document.getElementById('colorMapCanvas'),
    fileNameSpan: document.getElementById('fileName'),
    toleranceSlider: document.getElementById('tolerance'),
    sliderTooltip: document.querySelector('.slider-tooltip'),
    modal: document.getElementById('displaySettingsModal'),
    modalTabs: document.getElementById('modalTabs'),
    modalTabContent: document.getElementById('modalTabContent'),
    nbtOutput: document.getElementById('nbtOutput'),
    downloadPatternBtn: document.getElementById('downloadPatternBtn')
};

const originalCtx = dom.originalCanvas.getContext('2d');
const patternCtx = dom.patternCanvas.getContext('2d');
const colorMapCtx = dom.colorMapCanvas.getContext('2d');

document.addEventListener('DOMContentLoaded', setupEventListeners);

// Core functions

function setupEventListeners() {
    const debouncedProcess = debounce(processImageAndUpdateUI, 100);

    ['modelName', 'caseString', 'fallbackModel'].forEach(id => {
        document.getElementById(id).addEventListener('input', debouncedProcess);
    });
    dom.toleranceSlider.addEventListener('input', () => {
        updateSliderTooltip();
        debouncedProcess();
    });

    document.getElementById('fileInput').onchange = handleFile;
    document.getElementById('chooseFileBtn').onclick = () => document.getElementById('fileInput').click();

    const dropZone = document.getElementById('dropZone');
    dropZone.ondragover = (e) => {
        e.preventDefault();
        dropZone.querySelector('.upload-area').classList.add('dragover');
    };
    dropZone.ondragleave = () => {
        dropZone.querySelector('.upload-area').classList.remove('dragover');
    };
    dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.querySelector('.upload-area').classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            document.getElementById('fileInput').files = e.dataTransfer.files;
            handleFile();
        }
    };

    // Modal listeners
    document.getElementById('displaySettingsBtn').addEventListener('click', openDisplaySettingsModal);
    document.getElementById('saveDisplaySettingsBtn').addEventListener('click', saveAndCloseDisplaySettingsModal);
    dom.downloadPatternBtn.addEventListener('click', downloadPattern);
    dom.modal.addEventListener('click', (e) => {
        if (e.target === dom.modal) {
            saveAndCloseDisplaySettingsModal();
        }
    });

    setDefaultDisplaySettings();
    updateSliderTooltip();
}

function handleFile() {
    const file = document.getElementById('fileInput').files[0];
    if (!file) {
        dom.fileNameSpan.textContent = '';
        return;
    }
    dom.fileNameSpan.textContent = file.name;

    const reader = new FileReader();
    reader.onload = e => {
        const img = new Image();
        img.onload = () => {
            const MAX_SIZE = 128;
            let size = Math.max(img.width, img.height);
            if (size > MAX_SIZE) {
                size = MAX_SIZE;
            }

            [dom.originalCanvas, dom.patternCanvas, dom.colorMapCanvas].forEach(c => {
                c.width = size;
                c.height = size;
            });
            [originalCtx, patternCtx, colorMapCtx].forEach(ctx => {
                ctx.imageSmoothingEnabled = false;
                ctx.clearRect(0, 0, size, size);
            });
            originalCtx.drawImage(img, 0, 0, size, size);
            imageData = originalCtx.getImageData(0, 0, size, size);

            generatedModel = null;
            generatedOverrideModel = null;

            processImageAndUpdateUI();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function processImageAndUpdateUI() {
    if (!imageData) return;

    const tolerance = parseInt(dom.toleranceSlider.value);
    const colors = new Map();
    const data = imageData.data;
    const width = imageData.width;

    for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a === 0) continue;

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const colorKey = `${r},${g},${b}`;

        if (!colors.has(colorKey)) {
            colors.set(colorKey, {
                r,
                g,
                b,
                pixels: []
            });
        }
        colors.get(colorKey).pixels.push({
            x: (i / 4) % width,
            y: Math.floor((i / 4) / width)
        });
    }

    const uniqueColors = Array.from(colors.values());
    colorGroups = [];

    if (tolerance === 0) {
        colorGroups = uniqueColors.map(c => ({
            baseColor: c,
            pixels: [...c.pixels]
        }));
    } else {
        const toleranceSq = tolerance * tolerance;
        for (const colorData of uniqueColors) {
            let foundGroup = null;
            for (const group of colorGroups) {
                const dr = group.baseColor.r - colorData.r;
                const dg = group.baseColor.g - colorData.g;
                const db = group.baseColor.b - colorData.b;
                const distSq = dr * dr + dg * dg + db * db;

                if (distSq <= toleranceSq) {
                    foundGroup = group;
                    break;
                }
            }

            if (foundGroup) {
                foundGroup.pixels.push(...colorData.pixels);
            } else {
                colorGroups.push({
                    baseColor: colorData,
                    pixels: [...colorData.pixels]
                });
            }
        }
    }

    colorGroups.sort((a, b) => b.pixels.length - a.pixels.length);

    generatedModel = null;
    generatedOverrideModel = null;

    updateUI();
}

function updateUI() {
    requestAnimationFrame(() => {
        drawColorMap();
        drawPattern();
        displayColorList();
        displayOriginalColorsArray();
        updateJSONDisplays();
    });
}

function updateJSONDisplays() {
    const jsonOutput = document.getElementById('jsonOutput');
    const itemsOutput = document.getElementById('itemsModelOutput');

    let totalPixels = 0;
    for (let i = 0; i < colorGroups.length; i++) {
        totalPixels += colorGroups[i].pixels.length;
    }

    if (totalPixels > 1000) {
        jsonOutput.innerHTML = `<div style="color: var(--text-color-secondary); padding: 20px; text-align: center;">
            <strong>Large Model Generated (${totalPixels} elements)</strong><br>
            <small>JSON preview disabled for performance.<br>
            Use Copy or Download buttons to get the full model.</small>
        </div>`;

        itemsOutput.innerHTML = `<div style="color: var(--text-color-secondary); padding: 20px; text-align: center;">
            <strong>Override Model Ready</strong><br>
            <small>Use Copy or Download buttons to get the model.</small>
        </div>`;
    } else {
        generateAndShowModels();
    }
}

function generateAndShowModels() {
    if (!generatedModel) {
        generatedModel = generateModel();
    }
    if (!generatedOverrideModel) {
        generatedOverrideModel = generateOverrideModel();
    }

    document.getElementById('jsonOutput').textContent = JSON.stringify(generatedModel, null, 2);
    document.getElementById('itemsModelOutput').textContent = JSON.stringify(generatedOverrideModel, null, 2);
}

function drawColorMap() {
    if (!imageData) return;
    colorMapCtx.clearRect(0, 0, dom.colorMapCanvas.width, dom.colorMapCanvas.height);

    const mapData = colorMapCtx.createImageData(imageData.width, imageData.height);
    const mapDataArray = mapData.data;

    const groupColors = new Array(colorGroups.length);
    for (let i = 0; i < colorGroups.length; i++) {
        const hue = (i * 137.5) % 360;
        groupColors[i] = hslToRgb(hue / 360, 0.8, 0.6);
    }

    const width = imageData.width;
    for (let i = 0; i < colorGroups.length; i++) {
        const color = groupColors[i];
        const pixels = colorGroups[i].pixels;

        for (let j = 0; j < pixels.length; j++) {
            const p = pixels[j];
            const idx = (p.y * width + p.x) * 4;
            mapDataArray[idx] = color[0];
            mapDataArray[idx + 1] = color[1];
            mapDataArray[idx + 2] = color[2];
            mapDataArray[idx + 3] = 255;
        }
    }
    colorMapCtx.putImageData(mapData, 0, 0);
}

function drawPattern() {
    if (!imageData) return;
    patternCtx.clearRect(0, 0, dom.patternCanvas.width, dom.patternCanvas.height);

    const patternImageData = patternCtx.createImageData(imageData.width, imageData.height);
    const patternData = patternImageData.data;
    const originalData = imageData.data;

    for (let i = 0; i < originalData.length; i += 4) {
        if (originalData[i + 3] > 0) {
            patternData[i] = 255;
            patternData[i + 1] = 255;
            patternData[i + 2] = 255;
            patternData[i + 3] = 255;
        }
    }
    patternCtx.putImageData(patternImageData, 0, 0);
    dom.downloadPatternBtn.style.display = 'inline-block';
}

function displayColorList() {
    const list = document.getElementById('colorList');
    if (colorGroups.length === 0) {
        list.innerHTML = '<div style="text-align:center; color: var(--text-color-secondary);">No color groups detected.</div>';
        return;
    }

    const displayLimit = 50;
    const showCount = Math.min(colorGroups.length, displayLimit);

    const items = new Array(showCount);
    for (let i = 0; i < showCount; i++) {
        const g = colorGroups[i];
        const c = g.baseColor;
        items[i] = `<div class="color-item">
            <div class="color-swatch" style="background-color: rgb(${c.r}, ${c.g}, ${c.b})"></div>
            <div class="color-info">TINT ${i} | RGB(${c.r},${c.g},${c.b}) | ${g.pixels.length}px</div>
        </div>`;
    }

    let html = items.join('');
    if (colorGroups.length > displayLimit) {
        html += `<div style="text-align:center; color: var(--text-color-secondary); padding: 10px;">
            ... and ${colorGroups.length - displayLimit} more color groups
        </div>`;
    }

    list.innerHTML = html;
}

function displayOriginalColorsArray() {
    const colorIntegers = new Array(colorGroups.length);
    for (let i = 0; i < colorGroups.length; i++) {
        const {
            r,
            g,
            b
        } = colorGroups[i].baseColor;
        colorIntegers[i] = (r << 16) + (g << 8) + b;
    }
    dom.nbtOutput.textContent = `[I;${colorIntegers.join(',')}]`;
}

function generateModel() {
    const modelName = document.getElementById('modelName').value || 'custom_item';
    const textureHeight = imageData ? imageData.height : 16;

    let totalPixels = 0;
    for (let i = 0; i < colorGroups.length; i++) {
        totalPixels += colorGroups[i].pixels.length;
    }

    const elements = new Array(totalPixels);
    let elementIndex = 0;

    for (let groupIndex = 0; groupIndex < colorGroups.length; groupIndex++) {
        const pixels = colorGroups[groupIndex].pixels;

        for (let pixelIndex = 0; pixelIndex < pixels.length; pixelIndex++) {
            const p = pixels[pixelIndex];
            const y1 = textureHeight - p.y - 1;
            const y2 = textureHeight - p.y;

            const face = {
                uv: [p.x, p.y, p.x + 1, p.y + 1],
                texture: "#layer0",
                tintindex: groupIndex
            };

            elements[elementIndex++] = {
                from: [p.x, y1, 7.5],
                to: [p.x + 1, y2, 8.5],
                faces: {
                    north: face,
                    east: face,
                    south: face,
                    west: face,
                    up: face,
                    down: face
                }
            };
        }
    }

    return {
        parent: 'item/generated',
        textures: {
            layer0: `item/${modelName}`
        },
        elements: elements,
        display: displaySettings
    };
}

function generateOverrideModel() {
    const modelName = document.getElementById('modelName').value || 'custom_item';
    const caseString = document.getElementById('caseString').value || 'custom';
    const fallbackModel = document.getElementById('fallbackModel').value || 'item/iron_sword';

    const tints = new Array(colorGroups.length);
    for (let i = 0; i < colorGroups.length; i++) {
        const c = colorGroups[i].baseColor;
        tints[i] = {
            type: "minecraft:custom_model_data",
            index: i,
            default: [c.r / 255, c.g / 255, c.b / 255]
        };
    }

    return {
        model: {
            type: "select",
            property: "custom_model_data",
            fallback: {
                type: "model",
                model: fallbackModel
            },
            cases: [{
                    when: caseString,
                    model: {
                        type: "model",
                        model: `item/${modelName}`,
                        tints: tints
                    }
                },
                {
                    when: "test",
                    model: {
                        type: "model",
                        model: "item/barrier"
                    }
                }
            ]
        }
    };
}

// Modal and utility functions
function openDisplaySettingsModal() {
    dom.modalTabs.innerHTML = '';
    dom.modalTabContent.innerHTML = '';
    const keys = Object.keys(displaySettings);

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const tab = document.createElement('div');
        tab.className = 'modal-tab';
        tab.textContent = key;
        tab.dataset.tab = key;

        const content = document.createElement('div');
        content.className = 'modal-content';
        content.id = `content-${key}`;
        const grid = document.createElement('div');
        grid.className = 'modal-grid';

        ['rotation', 'translation', 'scale'].forEach(prop => {
            if (displaySettings[key][prop]) {
                grid.innerHTML += `<label>${prop.charAt(0).toUpperCase() + prop.slice(1)}</label>`;
                displaySettings[key][prop].forEach((val, index) => {
                    grid.innerHTML += `<input type="number" step="0.01" value="${val}" data-key="${key}" data-prop="${prop}" data-index="${index}">`;
                });
            }
        });

        content.appendChild(grid);
        if (i === 0) {
            tab.classList.add('active');
            content.classList.add('active');
        }

        tab.onclick = () => {
            document.querySelectorAll('.modal-tab, .modal-content').forEach(el => el.classList.remove('active'));
            tab.classList.add('active');
            content.classList.add('active');
        };

        dom.modalTabs.appendChild(tab);
        dom.modalTabContent.appendChild(content);
    }
    dom.modal.classList.add('visible');
}

function saveAndCloseDisplaySettingsModal() {
    document.querySelectorAll('#modalTabContent input').forEach(input => {
        const {
            key,
            prop,
            index
        } = input.dataset;
        displaySettings[key][prop][index] = parseFloat(input.value) || 0;
    });
    dom.modal.classList.remove('visible');
    generatedModel = null;
    updateUI();
}

function debounce(func, delay = 100) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

function updateSliderTooltip() {
    const val = dom.toleranceSlider.value;
    const min = dom.toleranceSlider.min || 0;
    const max = dom.toleranceSlider.max || 100;
    const percent = ((val - min) * 100) / (max - min);
    dom.sliderTooltip.innerHTML = val;
    const thumbSize = 16;
    const trackWidth = dom.toleranceSlider.offsetWidth;
    const thumbPosition = (trackWidth - thumbSize) * (percent / 100);
    dom.sliderTooltip.style.left = `${thumbPosition + thumbSize / 2}px`;
}

function setDefaultDisplaySettings() {
    displaySettings = {
        thirdperson_righthand: {
            rotation: [0, -90, 55],
            translation: [0, 4, 0.5],
            scale: [0.85, 0.85, 0.85]
        },
        thirdperson_lefthand: {
            rotation: [0, 90, -55],
            translation: [0, 4, 0.5],
            scale: [0.85, 0.85, 0.85]
        },
        firstperson_righthand: {
            rotation: [0, -90, 25],
            translation: [1.13, 3.2, 1.13],
            scale: [0.68, 0.68, 0.68]
        },
        firstperson_lefthand: {
            rotation: [0, 90, -25],
            translation: [1.13, 3.2, 1.13],
            scale: [0.68, 0.68, 0.68]
        },
        ground: {
            translation: [0, 3, 0],
            scale: [0.5, 0.5, 0.5]
        },
        gui: {
            scale: [1, 1, 1]
        },
        head: {
            translation: [0, 14.5, 0],
            scale: [1.6, 1.6, 1.6]
        },
        fixed: {
            rotation: [0, 180, 0],
            scale: [1, 1, 1]
        }
    };
}

function copyToClipboard(elementId, button) {
    let content;

    if (elementId === 'jsonOutput') {
        if (!generatedModel) {
            generatedModel = generateModel();
        }
        content = JSON.stringify(generatedModel, null, 2);
    } else if (elementId === 'itemsModelOutput') {
        if (!generatedOverrideModel) {
            generatedOverrideModel = generateOverrideModel();
        }
        content = JSON.stringify(generatedOverrideModel, null, 2);
    } else {
        content = document.getElementById(elementId).textContent;
    }

    navigator.clipboard.writeText(content).then(() => {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        button.style.backgroundColor = '#28a745';
        setTimeout(() => {
            button.textContent = originalText;
            button.style.backgroundColor = '';
        }, 2000);
    }).catch(err => console.error('Failed to copy: ', err));
}

function downloadJSON(elementId, type = 'model') {
    let content;
    let fileName;

    if (elementId === 'jsonOutput') {
        if (!generatedModel) {
            generatedModel = generateModel();
        }
        content = JSON.stringify(generatedModel, null, 2);
        fileName = `${document.getElementById('modelName').value || 'custom_item'}.json`;
    } else if (elementId === 'itemsModelOutput') {
        if (!generatedOverrideModel) {
            generatedOverrideModel = generateOverrideModel();
        }
        content = JSON.stringify(generatedOverrideModel, null, 2);
        const fallbackModel = document.getElementById('fallbackModel').value || 'item/iron_sword';
        fileName = fallbackModel.split('/').pop() + '.json';
    } else {
        content = document.getElementById(elementId).textContent;
        fileName = `${document.getElementById('modelName').value || 'custom_item'}.json`;
    }

    const blob = new Blob([content], {
        type: 'application/json'
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
}

function downloadPattern() {
    const a = document.createElement('a');
    a.href = dom.patternCanvas.toDataURL('image/png');
    const modelName = document.getElementById('modelName').value || 'custom_item';
    a.download = `${modelName}.png`;
    a.click();
}

async function downloadResourcePack() {
    if (!imageData) {
        alert("Please generate a model first by uploading an image.");
        return;
    }

    if (!generatedModel) generatedModel = generateModel();
    if (!generatedOverrideModel) generatedOverrideModel = generateOverrideModel();

    const modelName = document.getElementById('modelName').value || 'custom_item';
    const fallbackModel = document.getElementById('fallbackModel').value || 'item/iron_sword';
    const overrideFileName = fallbackModel.split('/').pop() + '.json';

    const zip = new JSZip();

    // pack.mcmeta
    const packMeta = {
        pack: {
            description: "Generated Model",
            pack_format: 69,
            supported_formats: {
                min_inclusive: 44, // 24w45a - 1.21.4
                max_inclusive: 69 // 25w37a – 1.21.9-pre1
            }
        }
    };
    zip.file("pack.mcmeta", JSON.stringify(packMeta, null, 2));

    const patternBlob = await new Promise(resolve => dom.patternCanvas.toBlob(resolve, 'image/png'));

    zip.file("pack.png", patternBlob);

    const assets = zip.folder("assets");
    const minecraft = assets.folder("minecraft");
    const items = minecraft.folder("items");
    const models = minecraft.folder("models");
    const modelsItem = models.folder("item");
    const textures = minecraft.folder("textures");
    const texturesItem = textures.folder("item");

    items.file(overrideFileName, JSON.stringify(generatedOverrideModel, null, 2));
    texturesItem.file(`${modelName}.png`, patternBlob);
    modelsItem.file(`${modelName}.json`, JSON.stringify(generatedModel, null, 2));

    zip.generateAsync({
        type: "blob"
    }).then(function(content) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = "generated_model_resourcepack.zip";
        a.click();
        URL.revokeObjectURL(a.href);
    });
}

function hslToRgb(h, s, l) {
    let r, g, b;
    if (s == 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
