
// initialise the module
var Module = {
    onRuntimeInitialized: async function() {
        console.log('wasm module loaded');
        // load the model when the module is ready
        if (Module.loadModel('flatmodel_large.bin')) {
            console.log('model loaded successfully');
            predictDigit(); // Predict immediately when loaded
        } else {
            console.error('failed to load model');
        }
    }
};

// canvas setup
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
let isDrawing = false;

// set up drawing
ctx.imageSmoothingEnabled = false; // disable smoothing for pixelated effect
ctx.strokeStyle = 'white';
ctx.lineWidth = 10; // one pixel in our 28x28 grid
ctx.lineCap = 'square'; // change to square for pixelated effect
ctx.fillStyle = 'black';
ctx.fillRect(0, 0, canvas.width, canvas.height);

// helper function to snap to grid
function snapToGrid(x, y) {
    const gridSize = 10; // 280/28 = 10 pixels per grid cell
    return {
        x: Math.floor(x / gridSize) * gridSize,
        y: Math.floor(y / gridSize) * gridSize
    };
}

let lastX = null;
let lastY = null;

function drawPixel(x, y) {
    const pos = snapToGrid(x, y);
    
    // if we have a last position, interpolate between points
    if (lastX !== null && lastY !== null) {
        const dx = pos.x - lastX;
        const dy = pos.y - lastY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.max(Math.floor(distance / 10), 1);
        
        for (let i = 0; i < steps; i++) {
            const t = i / steps;
            const ix = Math.round(lastX + dx * t);
            const iy = Math.round(lastY + dy * t);
            
            // draw main pixel
            ctx.fillStyle = 'white';
            ctx.fillRect(ix, iy, 10, 10);
            
            // draw surrounding pixels with reduced opacity
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.fillRect(ix-10, iy, 10, 10);  // left
            ctx.fillRect(ix+10, iy, 10, 10);  // right
            ctx.fillRect(ix, iy-10, 10, 10);  // top
            ctx.fillRect(ix, iy+10, 10, 10);  // bottom
            
            // even softer diagonal pixels
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(ix-10, iy-10, 10, 10);  // top-left
            ctx.fillRect(ix+10, iy-10, 10, 10);  // top-right
            ctx.fillRect(ix-10, iy+10, 10, 10);  // bottom-left
            ctx.fillRect(ix+10, iy+10, 10, 10);  // bottom-right
        }
    } else {
        // Same pattern for single clicks
        ctx.fillStyle = 'white';
        ctx.fillRect(pos.x, pos.y, 10, 10);
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillRect(pos.x-10, pos.y, 10, 10);
        ctx.fillRect(pos.x+10, pos.y, 10, 10);
        ctx.fillRect(pos.x, pos.y-10, 10, 10);
        ctx.fillRect(pos.x, pos.y+10, 10, 10);
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(pos.x-10, pos.y-10, 10, 10);
        ctx.fillRect(pos.x+10, pos.y-10, 10, 10);
        ctx.fillRect(pos.x-10, pos.y+10, 10, 10);
        ctx.fillRect(pos.x+10, pos.y+10, 10, 10);
    }
    
    lastX = pos.x;
    lastY = pos.y;
}

// add touch event handlers
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault(); // prevent scrolling
    isDrawing = true;
    lastX = null;
    lastY = null;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    drawPixel(x, y);
    predictDigit();
});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault(); // prevent scrolling
    if (isDrawing) {
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        drawPixel(x, y);
        predictDigit();
    }
});

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    isDrawing = false;
    lastX = null;
    lastY = null;
    predictDigit();
});

canvas.onmousedown = (e) => {
    isDrawing = true;
    lastX = null;
    lastY = null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    drawPixel(x, y);
    predictDigit();
};

canvas.onmousemove = (e) => {
    if (isDrawing) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        drawPixel(x, y);
        predictDigit();
    }
};

canvas.onmouseup = () => {
    isDrawing = false;
    lastX = null;
    lastY = null;
    predictDigit();
};

function clearCanvas() {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    predictDigit();
}

function predictDigit() {
    // get pixel data directly from the already-quantized canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 28;
    tempCanvas.height = 28;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(canvas, 0, 0, 28, 28);
    
    // get pixel data
    const imageData = tempCtx.getImageData(0, 0, 28, 28).data;
    
    try {
        // create a Float64Array for the input
        const input = new Float64Array(28 * 28);
        for (let i = 0; i < imageData.length; i += 4) {
            // use all colour channels for smoother edges
            input[i/4] = (imageData[i] + imageData[i+1] + imageData[i+2]) / (3 * 255.0);
        }

        // convert to vector that emscripten can understand
        const inputVector = new Module.VectorFloat();
        for (let i = 0; i < input.length; i++) {
            inputVector.push_back(input[i]);
        }

        // get predictions
        const predictions = Module.predict(inputVector);
        
        // clean up the vector
        inputVector.delete();
        
        // display results
        let html = '<h2>Predictions:</h2><div class="predictions-container">';
        // convert predictions to array if it isn't already
        const predArray = Array.from({length: 10}, (_, i) => predictions.get(i));
        predArray.forEach((prob, digit) => {
            const percentage = (prob * 100).toFixed(1);
            const barWidth = Math.max(percentage, 2);
            html += `
                <div class="prediction-row">
                    <span class="digit-label">${digit}:</span>
                    <div class="prediction-bar" style="width: ${barWidth}%"></div>
                    <span class="percentage-label">${percentage}%</span>
                </div>`;
        });
        html += '</div>';

        // clean up the predictions vector if it's a WASM vector
        if (predictions.delete) {
            predictions.delete();
        }

        document.getElementById('predictions').innerHTML = html;
    } catch (error) {
        console.error('Prediction error:', error);
        document.getElementById('predictions').innerHTML = 'Error making prediction';
    }
}