document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const bgContainer = document.querySelector('.canvas-container');
    const svgLayer = document.getElementById('connection-layer');
    const templates = document.querySelectorAll('.template-shape');
    const activeLine = document.getElementById('drawing-line');
    
    // Properties Toolbar
    const propertiesToolbar = document.getElementById('properties-toolbar');
    const fillColorInput = document.getElementById('fill-color');
    const textColorInput = document.getElementById('text-color');
    const fontSizeInput = document.getElementById('font-size');
    const lineProps = document.getElementById('line-props');
    const lineDirSelect = document.getElementById('line-dir');
    
    let shapeCount = 0;
    
    // State
    const shapes = {}; // id -> DOM element
    const connections = []; // Array of line objects
    
    let draggedTemplateType = null;
    let selectedShape = null;
    let selectedConnection = null;
    
    // Dragging Shapes on Canvas
    let isDraggingShape = false;
    let isResizing = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let shapeStartX = 0;
    let shapeStartY = 0;
    let shapeStartWidth = 0;
    let shapeStartHeight = 0;
    
    // Drawing Lines (drafting)
    let isDrawingLine = false;
    let draftingStart = null; // {type: 'shape', shapeId, portId}
    
    // Dragging existing line handles
    let isDraggingHandle = false;
    let activeHandle = null; // { connId, end: 'start'|'end' }

    // ----- Initialization -----
    function rgbToHex(rgb) {
        if (!rgb) return null;
        if (rgb.startsWith('#')) return rgb;
        const matches = rgb.match(/\d+/g);
        if (!matches) return null;
        return '#' + matches.map(x => parseInt(x).toString(16).padStart(2, '0')).slice(0, 3).join('');
    }

    fillColorInput.addEventListener('input', (e) => {
        if (selectedShape) selectedShape.style.backgroundColor = e.target.value;
    });
    fillColorInput.addEventListener('change', () => saveState());

    textColorInput.addEventListener('input', (e) => {
        if (selectedShape) {
            const span = selectedShape.querySelector('.shape-text');
            if (span) span.style.color = e.target.value;
        } else if (selectedConnection) {
            selectedConnection.labelNode.style.color = e.target.value;
        }
    });
    textColorInput.addEventListener('change', () => saveState());

    fontSizeInput.addEventListener('change', (e) => {
        if (selectedShape) {
            const span = selectedShape.querySelector('.shape-text');
            if (span) span.style.fontSize = e.target.value + 'px';
            updateAllPaths();
        } else if (selectedConnection) {
            selectedConnection.labelNode.style.fontSize = e.target.value + 'px';
            updateAllPaths();
        }
        saveState();
    });

    lineDirSelect.addEventListener('change', (e) => {
        if (selectedConnection) {
            selectedConnection.dir = e.target.value;
            applyLineMarkers(selectedConnection);
            saveState();
        }
    });

    // Setup Sidebar Drag and Drop
    templates.forEach(t => {
        t.addEventListener('dragstart', (e) => {
            draggedTemplateType = e.target.closest('.template-shape').dataset.type;
            e.dataTransfer.setData('text/plain', draggedTemplateType);
        });
    });

    canvas.addEventListener('dragover', (e) => {
        e.preventDefault(); // allow drop
    });

    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        if (draggedTemplateType) {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            if (draggedTemplateType === 'arrow') {
                // Create standalone line
                createLine({type: 'coord', x: x - 60, y: y}, {type: 'coord', x: x + 60, y: y});
            } else {
                createShape(draggedTemplateType, x, y);
            }
            draggedTemplateType = null;
            saveState();
        }
    });

    // ----- Shape Creation -----
    function createShape(type, x, y) {
        shapeCount++;
        const id = 'shape-' + Date.now() + '-' + shapeCount;
        
        const shape = document.createElement('div');
        shape.classList.add('canvas-shape');
        
        // Setup type specific classes
        if (type === 'rectangle') shape.classList.add('is-rect');
        else if (type === 'circle') shape.classList.add('is-circ');
        else if (type === 'diamond') shape.classList.add('is-diam');
        else if (type === 'pill') shape.classList.add('is-pill');
        else if (type === 'parallelogram') shape.classList.add('is-para');
        else if (type === 'hexagon') shape.classList.add('is-hex');
        else if (type === 'document') shape.classList.add('is-doc');
        else if (type === 'delay') shape.classList.add('is-delay');
        else if (type === 'display') shape.classList.add('is-disp');
        else if (type === 'text') shape.classList.add('is-text');
        
        // Center the shape on the drop point rough estimation
        let width = 100;
        let height = 100;
        if (['rectangle', 'parallelogram', 'hexagon', 'document', 'delay', 'display'].includes(type)) { width = 120; height = 80; }
        else if (type === 'pill') { width = 120; height = 60; }
        else if (type === 'text') { width = 120; height = 40; }
        
        let posX = x;
        let posY = y;
        if (!window.isPastingMode) {
            posX -= width / 2;
            posY -= height / 2;
        }
        
        shape.id = id;
        shape.style.left = `${posX}px`;
        shape.style.top = `${posY}px`;
        shape.dataset.type = type;

        // Content
        const textSpan = document.createElement('span');
        textSpan.classList.add('shape-text');
        textSpan.contentEditable = true;
        
        let label = type.charAt(0).toUpperCase() + type.slice(1);
        if (type === 'parallelogram') label = 'Data';
        else if (type === 'pill') label = 'Terminator';
        else if (type === 'hexagon') label = 'Preparation';
        else if (type === 'document') label = 'Document';
        else if (type === 'delay') label = 'Delay';
        else if (type === 'display') label = 'Display';
        else if (type === 'text') label = 'Text block';
        textSpan.innerText = label;
        textSpan.addEventListener('mousedown', (e) => {
             e.stopPropagation(); // let people click and type without moving shape
        });
        textSpan.addEventListener('click', (e) => {
             selectShape(shape);
        });
        textSpan.addEventListener('blur', () => { if (!window.isUndoRedoing) saveState(); });
        shape.appendChild(textSpan);

        // Ports
        const dirs = ['top', 'right', 'bottom', 'left'];
        dirs.forEach(d => {
            const port = document.createElement('div');
            port.classList.add('port', `port-${d}`);
            port.dataset.dir = d;
            port.dataset.shapeId = id;
            
            port.addEventListener('mousedown', onPortMouseDown);
            shape.appendChild(port);
        });

        // Resize Handle
        const resizeHandle = document.createElement('div');
        resizeHandle.classList.add('resize-handle');
        resizeHandle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            isResizing = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            shapeStartWidth = shape.offsetWidth;
            shapeStartHeight = shape.offsetHeight;
        });
        shape.appendChild(resizeHandle);

        shape.addEventListener('mousedown', onShapeMouseDown);
        
        canvas.appendChild(shape);
        shapes[id] = shape;
        
        selectShape(shape);
    }

    // ----- Line / Arrow Creation -----
    function createLine(startDef, endDef) {
        const id = 'line-' + Date.now();
        
        // Path SVG
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('id', id);
        path.setAttribute('class', 'connection');
        svgLayer.appendChild(path);
        
        // Editable Label Div
        const labelNode = document.createElement('div');
        labelNode.classList.add('line-label');
        labelNode.contentEditable = false;
        labelNode.innerHTML = '';
        labelNode.addEventListener('mousedown', (e) => e.stopPropagation() );
        labelNode.addEventListener('dblclick', (e) => {
             e.stopPropagation();
             labelNode.contentEditable = true;
             labelNode.focus();
        });
        labelNode.addEventListener('blur', () => { 
            labelNode.contentEditable = false; 
            if (!window.isUndoRedoing) saveState(); 
        });
        labelNode.addEventListener('click', (e) => selectConnection(lineObj) );
        labelNode.addEventListener('input', () => updateAllPaths() );
        canvas.appendChild(labelNode);
        
        // Start Handle
        const startHandle = document.createElement('div');
        startHandle.classList.add('line-handle');
        startHandle.addEventListener('mousedown', (e) => onHandleMouseDown(e, id, 'start'));
        canvas.appendChild(startHandle);

        // Bend Control Handle
        const bendHandle = document.createElement('div');
        bendHandle.classList.add('line-handle', 'bend-handle');
        bendHandle.style.borderColor = '#f59e0b';
        bendHandle.addEventListener('mousedown', (e) => onHandleMouseDown(e, id, 'bend'));
        bendHandle.addEventListener('dblclick', (e) => {
             e.stopPropagation();
             lineObj.bendPoint = null;
             updateAllPaths();
             if (!window.isUndoRedoing) saveState();
        });
        canvas.appendChild(bendHandle);
        
        // End Handle
        const endHandle = document.createElement('div');
        endHandle.classList.add('line-handle');
        endHandle.addEventListener('mousedown', (e) => onHandleMouseDown(e, id, 'end'));
        canvas.appendChild(endHandle);

        path.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            selectConnection(lineObj);
        });

        const lineObj = {
            id,
            start: startDef,
            end: endDef,
            dir: 'end',
            pathNode: path,
            labelNode,
            startHandle,
            endHandle,
            bendHandle,
            bendPoint: null
        };
        
        connections.push(lineObj);
        applyLineMarkers(lineObj);
        updateAllPaths();
        selectConnection(lineObj);
    }
    
    function applyLineMarkers(conn) {
        if (conn.dir === 'end' || conn.dir === 'both') {
            conn.pathNode.setAttribute('marker-end', 'url(#arrow-end)');
        } else {
            conn.pathNode.removeAttribute('marker-end');
        }
        
        if (conn.dir === 'start' || conn.dir === 'both') {
            conn.pathNode.setAttribute('marker-start', 'url(#arrow-start)');
        } else {
            conn.pathNode.removeAttribute('marker-start');
        }
    }

    // ----- Selection & Deletion -----
    function toggleHandles(conn, show) {
        if (!conn) return;
        if (show) {
            conn.startHandle.classList.add('visible');
            conn.endHandle.classList.add('visible');
            conn.bendHandle.classList.add('visible');
        } else {
            conn.startHandle.classList.remove('visible');
            conn.endHandle.classList.remove('visible');
            conn.bendHandle.classList.remove('visible');
        }
    }

    function selectShape(shape) {
        if (selectedShape) selectedShape.classList.remove('selected');
        if (selectedConnection) {
            selectedConnection.pathNode.classList.remove('selected');
            selectedConnection.labelNode.classList.remove('selected');
            toggleHandles(selectedConnection, false);
            selectedConnection = null;
        }
        
        selectedShape = shape;
        
        if (shape) {
            shape.classList.add('selected');
            propertiesToolbar.classList.add('visible');
            lineProps.style.display = 'none';
            fillColorInput.parentElement.style.display = 'flex'; // show fill for shapes
            
            const span = shape.querySelector('.shape-text');
            const bg = window.getComputedStyle(shape).backgroundColor;
            const tc = window.getComputedStyle(span).color;
            const fs = window.getComputedStyle(span).fontSize;
            
            fillColorInput.value = rgbToHex(bg) || '#e2e8f0';
            textColorInput.value = rgbToHex(tc) || '#0f172a';
            fontSizeInput.value = parseInt(fs) || 14;
        } else {
            propertiesToolbar.classList.remove('visible');
        }
    }

    function selectConnection(conn) {
        if (selectedShape) {
            selectedShape.classList.remove('selected');
            selectedShape = null;
        }
        if (selectedConnection && selectedConnection !== conn) {
            selectedConnection.pathNode.classList.remove('selected');
            selectedConnection.labelNode.classList.remove('selected');
            toggleHandles(selectedConnection, false);
        }
        
        selectedConnection = conn;
        
        if (conn) {
            conn.pathNode.classList.add('selected');
            conn.labelNode.classList.add('selected');
            toggleHandles(conn, true);
            
            propertiesToolbar.classList.add('visible');
            lineProps.style.display = 'flex';
            fillColorInput.parentElement.style.display = 'none'; // hide fill for lines
            
            const tc = window.getComputedStyle(conn.labelNode).color;
            const fs = window.getComputedStyle(conn.labelNode).fontSize;
            
            textColorInput.value = rgbToHex(tc) || '#0f172a';
            fontSizeInput.value = parseInt(fs) || 14;
            lineDirSelect.value = conn.dir;
        } else {
            propertiesToolbar.classList.remove('visible');
        }
    }

    canvas.addEventListener('mousedown', (e) => {
        if (e.target === canvas || e.target === svgLayer) {
            selectShape(null);
            selectConnection(null);
        }
    });

    document.addEventListener('keydown', (e) => {
        // Only trigger diagram keyboard commands if we aren't editing text
        if (document.activeElement && document.activeElement.contentEditable === 'true') {
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            if (e.shiftKey) redo(); else undo();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') { e.preventDefault(); copyTarget(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key === 'x') { e.preventDefault(); cutTarget(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key === 'v') { e.preventDefault(); pasteTarget(); return; }

        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (selectedShape) {
                deleteShape(selectedShape.id);
                selectedShape = null;
                propertiesToolbar.classList.remove('visible');
                saveState();
            } else if (selectedConnection) {
                deleteConnection(selectedConnection.id);
                selectedConnection = null;
                propertiesToolbar.classList.remove('visible');
                saveState();
            }
        }
    });

    let clipoardData = null;
    function copyTarget() {
        if (selectedShape) clipoardData = { sysType: 'shape', data: getMinoData().shapes.find(s => s.id === selectedShape.id) };
        else if (selectedConnection) clipoardData = null; // Too complex to copy connections contextually
    }
    function cutTarget() {
        if (selectedShape) {
            copyTarget();
            deleteShape(selectedShape.id);
            selectedShape = null; propertiesToolbar.classList.remove('visible');
            saveState();
        }
    }
    function pasteTarget() {
        if (!clipoardData || clipoardData.sysType !== 'shape') return;
        
        window.isPastingMode = true; // prevent centering logic
        let cData = clipoardData.data;
        cData.x += 20; cData.y += 20; // stagger pastes
        
        createShape(cData.type, cData.x, cData.y);
        const newShape = Object.values(shapes).pop(); // Get newly created
        
        newShape.style.width = cData.w + 'px';
        newShape.style.height = cData.h + 'px';
        newShape.style.backgroundColor = cData.fill;
        const span = newShape.querySelector('.shape-text');
        span.innerHTML = cData.text;
        span.style.color = cData.textColor;
        span.style.fontSize = cData.textSize;
        
        window.isPastingMode = false;
        selectShape(newShape);
        saveState();
    }

    function deleteShape(id) {
        const shape = shapes[id];
        if (!shape) return;
        
        // Remove related connections or detach them
        connections.forEach(c => {
            if (c.start.shapeId === id) c.start = getPointFromDef(c.start); // convert to coord
            if (c.end.shapeId === id) c.end = getPointFromDef(c.end); // convert to coord
        });
        
        shape.remove();
        delete shapes[id];
        updateAllPaths();
    }

    function deleteConnection(connId) {
        const idx = connections.findIndex(c => c.id === connId);
        if (idx !== -1) {
            const c = connections[idx];
            c.pathNode.remove();
            c.labelNode.remove();
            c.startHandle.remove();
            c.endHandle.remove();
            if (c.bendHandle) c.bendHandle.remove();
            connections.splice(idx, 1);
        }
    }

    // ----- Moving / Dragging -----
    function onShapeMouseDown(e) {
        if (e.target.classList.contains('port') || 
            e.target.classList.contains('shape-text') || 
            e.target.classList.contains('resize-handle')) return;
        
        isDraggingShape = true;
        selectShape(this);
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        shapeStartX = parseInt(this.style.left || 0);
        shapeStartY = parseInt(this.style.top || 0);
        e.preventDefault();
    }

    function onHandleMouseDown(e, connId, end) {
        e.stopPropagation();
        isDraggingHandle = true;
        activeHandle = { connId, end };
        selectConnection(connections.find(c => c.id === connId));
        
        document.body.classList.add('is-drawing');
        svgLayer.style.pointerEvents = 'none';
        
        const conn = connections.find(c => c.id === connId);
        if (end === 'bend') {
            if (!conn.bendPoint) {
                conn.bendPoint = {x: e.clientX, y: e.clientY};
            }
        } else {
            // Detach it from shape so it follows mouse freely
            const pt = getPointFromDef(conn[end]);
            conn[end] = { type: 'coord', x: pt.x, y: pt.y };
        }
    }

    document.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (isDraggingShape && selectedShape) {
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            selectedShape.style.left = `${shapeStartX + dx}px`;
            selectedShape.style.top = `${shapeStartY + dy}px`;
            updateAllPaths();
        }
        
        if (isResizing && selectedShape) {
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            selectedShape.style.width = `${Math.max(40, shapeStartWidth + dx)}px`;
            selectedShape.style.height = `${Math.max(40, shapeStartHeight + dy)}px`;
            updateAllPaths();
        }
        
        if (isDraggingHandle && activeHandle) {
            const conn = connections.find(c => c.id === activeHandle.connId);
            if (activeHandle.end === 'bend') {
                conn.bendPoint = { x: mouseX, y: mouseY };
            } else {
                conn[activeHandle.end] = { type: 'coord', x: mouseX, y: mouseY };
            }
            updateAllPaths();
        }
        
        if (isDrawingLine) {
            const startPt = getPointFromDef(draftingStart);
            let tempPts = resolveOrthogonalPoints(startPt, {x: mouseX, y: mouseY}, draftingStart.portId, 'none', null);
            let d = `M ${tempPts[0].x} ${tempPts[0].y} `;
            for(let i=1; i<tempPts.length; i++) d += `L ${tempPts[i].x} ${tempPts[i].y} `;
            activeLine.setAttribute('d', d);
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (isDraggingShape && selectedShape) {
            isDraggingShape = false;
            saveState();
        }
        
        if (isResizing && selectedShape) {
            isResizing = false;
            saveState();
        }
        
        if (isDraggingHandle && activeHandle) {
            isDraggingHandle = false;
            const conn = connections.find(c => c.id === activeHandle.connId);
            if (activeHandle.end !== 'bend') {
                const target = findDropTarget(e);
                if (target) {
                    conn[activeHandle.end] = target;
                }
            }
            activeHandle = null;
            document.body.classList.remove('is-drawing');
            svgLayer.style.pointerEvents = 'stroke'; // re-enable clicks on SVG paths
            updateAllPaths();
            saveState();
        }
        
        if (isDrawingLine) {
            isDrawingLine = false;
            document.body.classList.remove('is-drawing');
            svgLayer.style.pointerEvents = 'stroke';
            activeLine.setAttribute('d', ''); // Clear active line
            
            const target = findDropTarget(e);
            if (target && (target.shapeId !== draftingStart.shapeId || target.type !== 'shape')) {
                createLine(draftingStart, target);
                saveState();
            } else {
                // Determine if we dragged out onto blank space, or just clicked the port
                const rect = canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                const sp = getPointFromDef(draftingStart);
                if (Math.abs(mouseX - sp.x) > 30 || Math.abs(mouseY - sp.y) > 30) {
                    createLine(draftingStart, {type: 'coord', x: mouseX, y: mouseY});
                    saveState();
                }
            }
            
            draftingStart = null;
        }
    });

    function findDropTarget(e) {
        if (e.target.classList.contains('port')) {
            return {
                type: 'shape',
                shapeId: e.target.dataset.shapeId,
                portId: e.target.dataset.dir
            };
        }
        
        let targetShapeEl = e.target.closest('.canvas-shape');
        
        if (!targetShapeEl) {
            const rectCanvas = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rectCanvas.left;
            const mouseY = e.clientY - rectCanvas.top;
            
            let closestShape = null;
            let minDistance = 60; // Snapping radius
            
            Object.values(shapes).forEach(shape => {
                const x = parseInt(shape.style.left || 0);
                const y = parseInt(shape.style.top || 0);
                const w = shape.offsetWidth;
                const h = shape.offsetHeight;
                
                const dx = Math.max(x - mouseX, 0, mouseX - (x + w));
                const dy = Math.max(y - mouseY, 0, mouseY - (y + h));
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                if (dist < minDistance) {
                    minDistance = dist;
                    closestShape = shape;
                }
            });
            if (closestShape) targetShapeEl = closestShape;
        }

        if (targetShapeEl) {
            const rect = targetShapeEl.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const dx = e.clientX - centerX;
            const dy = e.clientY - centerY;
            let portId = 'top';
            if (Math.abs(dx) > Math.abs(dy)) {
                portId = dx > 0 ? 'right' : 'left';
            } else {
                portId = dy > 0 ? 'bottom' : 'top';
            }
            return { type: 'shape', shapeId: targetShapeEl.id, portId };
        }
        return null; // dropped on empty space
    }

    // ----- Port / Path Logic -----
    function getSimplePortCoordinates(shapeId, dir) {
        const shape = shapes[shapeId];
        if (!shape) return { x: 0, y: 0 };
        const w = shape.offsetWidth;
        const h = shape.offsetHeight;
        let x = parseInt(shape.style.left || 0);
        let y = parseInt(shape.style.top || 0);
        switch (dir) {
            case 'top': x += w/2; y += 0; break;
            case 'right': x += w; y += h/2; break;
            case 'bottom': x += w/2; y += h; break;
            case 'left': x += 0; y += h/2; break;
        }
        return { x, y };
    }

    function getDynamicPortCoordinates(shapeId, dir, offsetFraction) {
        const shape = shapes[shapeId];
        if (!shape) return { x: 0, y: 0 };
        const w = shape.offsetWidth;
        const h = shape.offsetHeight;
        let x = parseInt(shape.style.left || 0);
        let y = parseInt(shape.style.top || 0);
        switch (dir) {
            case 'top': x += w * offsetFraction; y += 0; break;
            case 'right': x += w; y += h * offsetFraction; break;
            case 'bottom': x += w * offsetFraction; y += h; break;
            case 'left': x += 0; y += h * offsetFraction; break;
        }
        return { x, y };
    }

    function getPointFromDef(def) {
        if (def.type === 'coord') return { x: def.x, y: def.y };
        if (def.type === 'shape') return getSimplePortCoordinates(def.shapeId, def.portId);
        return { x: 0, y: 0 };
    }

    function onPortMouseDown(e) {
        e.stopPropagation();
        isDrawingLine = true;
        draftingStart = {
            type: 'shape',
            shapeId: e.target.dataset.shapeId,
            portId: e.target.dataset.dir
        };
        
        // Return empty if dragging out line, we'll draw it orthogonally during move
    }

    function resolveOrthogonalPoints(p1, p2, dir1, dir2, bendPoint, offset1 = 30, offset2 = 30) {
        let p1Out = { x: p1.x, y: p1.y };
        if (dir1 === 'top') p1Out.y -= offset1;
        else if (dir1 === 'bottom') p1Out.y += offset1;
        else if (dir1 === 'left') p1Out.x -= offset1;
        else if (dir1 === 'right') p1Out.x += offset1;

        let p2Out = { x: p2.x, y: p2.y };
        if (dir2 === 'top') p2Out.y -= offset2;
        else if (dir2 === 'bottom') p2Out.y += offset2;
        else if (dir2 === 'left') p2Out.x -= offset2;
        else if (dir2 === 'right') p2Out.x += offset2;
        else if (dir2 === 'none') p2Out = { ...p2 };

        let pts = [p1, p1Out];
        
        let isVertical1 = dir1 === 'top' || dir1 === 'bottom';
        let isVertical2 = dir2 === 'top' || dir2 === 'bottom';
        if (dir2 === 'none') {
            isVertical2 = Math.abs(p2Out.y - p1Out.y) > Math.abs(p2Out.x - p1Out.x);
        }

        if (bendPoint) {
            if (isVertical1) pts.push({ x: p1Out.x, y: bendPoint.y });
            else pts.push({ x: bendPoint.x, y: p1Out.y });
            
            pts.push({ x: bendPoint.x, y: bendPoint.y });

            if (isVertical2) pts.push({ x: p2Out.x, y: bendPoint.y });
            else pts.push({ x: bendPoint.x, y: p2Out.y });
        } else {
            if (isVertical1 && isVertical2) {
                let midY = (p1Out.y + p2Out.y) / 2;
                pts.push({ x: p1Out.x, y: midY });
                pts.push({ x: p2Out.x, y: midY });
            } else if (!isVertical1 && !isVertical2) {
                let midX = (p1Out.x + p2Out.x) / 2;
                pts.push({ x: midX, y: p1Out.y });
                pts.push({ x: midX, y: p2Out.y });
            } else if (isVertical1 && !isVertical2) {
                pts.push({ x: p1Out.x, y: p2Out.y });
            } else {
                pts.push({ x: p2Out.x, y: p1Out.y });
            }
        }

        if (dir2 !== 'none') pts.push(p2Out);
        pts.push(p2);
        
        const cleanPts = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
            const prev = cleanPts[cleanPts.length - 1];
            if (Math.abs(pts[i].x - prev.x) > 1 || Math.abs(pts[i].y - prev.y) > 1) {
                cleanPts.push(pts[i]);
            }
        }
        return cleanPts;
    }

    function updateAllPaths() {
        const portConnections = {};
        
        connections.forEach(conn => {
            if (conn.start && conn.start.type === 'shape') {
                const key = `${conn.start.shapeId}-${conn.start.portId}`;
                if (!portConnections[key]) portConnections[key] = [];
                const otherEnd = conn.end.type === 'shape' ? getSimplePortCoordinates(conn.end.shapeId, conn.end.portId) : conn.end;
                portConnections[key].push({ connId: conn.id, type: 'start', otherEnd });
            }
            if (conn.end && conn.end.type === 'shape') {
                const key = `${conn.end.shapeId}-${conn.end.portId}`;
                if (!portConnections[key]) portConnections[key] = [];
                const otherEnd = conn.start.type === 'shape' ? getSimplePortCoordinates(conn.start.shapeId, conn.start.portId) : conn.start;
                portConnections[key].push({ connId: conn.id, type: 'end', otherEnd });
            }
        });

        const connOffsets = {};
        const connPushDist = {};
        Object.keys(portConnections).forEach(key => {
            const arr = portConnections[key];
            const [shapeId, dir] = key.split('-');
            
            arr.sort((a, b) => {
                let diff = 0;
                if (dir === 'left' || dir === 'right') diff = a.otherEnd.y - b.otherEnd.y;
                else diff = a.otherEnd.x - b.otherEnd.x;
                
                if (Math.abs(diff) < 2) {
                    diff = a.connId.localeCompare(b.connId);
                }
                return diff;
            });
            
            let reverseDist = false;
            let sourceShape = shapes[shapeId];
            if (sourceShape) {
                let sourceCenter = {
                    x: parseInt(sourceShape.style.left) + sourceShape.offsetWidth/2,
                    y: parseInt(sourceShape.style.top) + sourceShape.offsetHeight/2
                };
                
                let avgTargetX = 0, avgTargetY = 0;
                arr.forEach(item => { avgTargetX += item.otherEnd.x; avgTargetY += item.otherEnd.y; });
                avgTargetX /= arr.length;
                avgTargetY /= arr.length;

                if (dir === 'right' && avgTargetY > sourceCenter.y) reverseDist = true;
                if (dir === 'left' && avgTargetY > sourceCenter.y) reverseDist = true;
                if (dir === 'bottom' && avgTargetX > sourceCenter.x) reverseDist = true;
                if (dir === 'top' && avgTargetX > sourceCenter.x) reverseDist = true;
            }

            arr.forEach((item, index) => {
                connOffsets[`${item.connId}-${item.type}`] = (index + 1) / (arr.length + 1);
                // Stagger outwards distance so parallel lines don't stack on each other
                let distIndex = reverseDist ? (arr.length - 1 - index) : index;
                connPushDist[`${item.connId}-${item.type}`] = 30 + (distIndex * 15);
            });
        });

        // Generate preliminary orthogonal points for all lines
        connections.forEach(conn => {
            let start = {x: 0, y: 0}, end = {x: 0, y: 0};
            let off1 = connPushDist[`${conn.id}-start`] || 30;
            let off2 = connPushDist[`${conn.id}-end`] || 30;
            
            if (conn.start.type === 'coord') start = { x: conn.start.x, y: conn.start.y };
            else if (conn.start.type === 'shape') {
                const frac = connOffsets[`${conn.id}-start`] || 0.5;
                start = getDynamicPortCoordinates(conn.start.shapeId, conn.start.portId, frac);
            }
            
            if (conn.end.type === 'coord') end = { x: conn.end.x, y: conn.end.y };
            else if (conn.end.type === 'shape') {
                const frac = connOffsets[`${conn.id}-end`] || 0.5;
                end = getDynamicPortCoordinates(conn.end.shapeId, conn.end.portId, frac);
            }

            conn._calcPts = resolveOrthogonalPoints(start, end, conn.start.portId || 'none', conn.end.portId || 'none', conn.bendPoint, off1, off2);
        });

        // Line Jumps (Find Intersections)
        let vSegs = [];
        connections.forEach(conn => {
            for (let i = 0; i < conn._calcPts.length - 1; i++) {
                let pA = conn._calcPts[i];
                let pB = conn._calcPts[i+1];
                if (Math.abs(pA.x - pB.x) < 2) {
                    vSegs.push({ x: pA.x, minY: Math.min(pA.y, pB.y), maxY: Math.max(pA.y, pB.y), connId: conn.id });
                }
            }
        });

        // Build Paths and Apply
        connections.forEach(conn => {
            const pts = conn._calcPts;
            let d = `M ${pts[0].x} ${pts[0].y} `;
            
            for (let i = 0; i < pts.length - 1; i++) {
                let pA = pts[i], pB = pts[i+1];
                
                // If horizontal segment
                if (Math.abs(pA.y - pB.y) < 2) {
                    let y = pA.y;
                    let minX = Math.min(pA.x, pB.x);
                    let maxX = Math.max(pA.x, pB.x);
                    
                    let crosses = [];
                    vSegs.forEach(v => {
                        if (v.connId !== conn.id && v.x > minX && v.x < maxX && y > v.minY && y < v.maxY) {
                            crosses.push(v.x);
                        }
                    });
                    
                    if (crosses.length > 0) {
                        if (pB.x > pA.x) { // Right direction
                            crosses.sort((a,b) => a - b);
                            crosses.forEach(cx => {
                                d += `L ${cx - 7} ${y} A 7 7 0 0 1 ${cx + 7} ${y} `;
                            });
                        } else { // Left direction
                            crosses.sort((a,b) => b - a);
                            crosses.forEach(cx => {
                                d += `L ${cx + 7} ${y} A 7 7 0 0 0 ${cx - 7} ${y} `;
                            });
                        }
                    }
                }
                d += `L ${pB.x} ${pB.y} `;
            }
            conn.pathNode.setAttribute('d', d);
            
            // Positioning UI Overlays
            let mx = 0, my = 0;
            if (conn.bendPoint) {
                mx = conn.bendPoint.x;
                my = conn.bendPoint.y;
            } else {
                let m = Math.floor(pts.length / 2);
                mx = pts.length % 2 === 0 ? (pts[m-1].x + pts[m].x)/2 : pts[m].x;
                my = pts.length % 2 === 0 ? (pts[m-1].y + pts[m].y)/2 : pts[m].y;
            }

            try {
                const length = conn.pathNode.getTotalLength();
                if (length > 0) {
                    let cp = conn.pathNode.getPointAtLength(length / 2);
                    mx = cp.x; my = cp.y;
                }
            } catch (e) {}

            conn.labelNode.style.left = `${mx}px`;
            conn.labelNode.style.top = `${my}px`;
            
            conn.startHandle.style.left = `${pts[0].x}px`;
            conn.startHandle.style.top = `${pts[0].y}px`;
            
            conn.endHandle.style.left = `${pts[pts.length-1].x}px`;
            conn.endHandle.style.top = `${pts[pts.length-1].y}px`;
            
            if (conn.bendPoint) {
                conn.bendHandle.style.left = `${conn.bendPoint.x}px`;
                conn.bendHandle.style.top = `${conn.bendPoint.y}px`;
            } else {
                conn.bendHandle.style.left = `${mx}px`;
                conn.bendHandle.style.top = `${my - 12}px`;
            }
        });
    }

    function clearCanvasBoard() {
        Object.keys(shapes).forEach(id => shapes[id].remove());
        for (let prop of Object.getOwnPropertyNames(shapes)) delete shapes[prop];
        
        connections.forEach(c => {
            c.pathNode.remove();
            c.labelNode.remove();
            c.startHandle.remove();
            c.endHandle.remove();
            if (c.bendHandle) c.bendHandle.remove();
        });
        connections.length = 0;
        
        selectShape(null);
        selectConnection(null);
    }

    // Theme Toggle
    const themeBtn = document.getElementById('theme-toggle');
    themeBtn.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        if(document.body.classList.contains('light-mode')) {
            themeBtn.innerText = '🌙 Dark';
        } else {
            themeBtn.innerText = '☀️ Light';
        }
    });

    // Clear Canvas Button
    document.getElementById('clear-btn').addEventListener('click', () => {
        if(confirm('Are you sure you want to clear the entire canvas?')) {
            clearCanvasBoard();
        }
    });

    // --- Export / Import ---
    function getMinoData() {
        return {
            shapes: Object.values(shapes).map(s => {
                const textSpan = s.querySelector('.shape-text');
                return {
                    id: s.id,
                    type: s.dataset.type,
                    x: parseInt(s.style.left),
                    y: parseInt(s.style.top),
                    w: parseInt(s.style.width || s.offsetWidth),
                    h: parseInt(s.style.height || s.offsetHeight),
                    text: textSpan.innerHTML,
                    fill: window.getComputedStyle(s).backgroundColor,
                    textColor: window.getComputedStyle(textSpan).color,
                    textSize: window.getComputedStyle(textSpan).fontSize
                };
            }),
            connections: connections.map(c => ({
                id: c.id,
                start: c.start,
                end: c.end,
                dir: c.dir,
                text: c.labelNode.innerHTML,
                textColor: window.getComputedStyle(c.labelNode).color,
                textSize: window.getComputedStyle(c.labelNode).fontSize,
                bendPoint: c.bendPoint
            }))
        };
    }
    
    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Export .mino
    document.getElementById('export-mino').addEventListener('click', (e) => {
        e.preventDefault();
        const data = getMinoData();
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        downloadBlob(blob, 'diagram.mino');
    });

    // Export Image (PNG)
    document.getElementById('export-image').addEventListener('click', (e) => {
        e.preventDefault();
        selectShape(null);
        selectConnection(null);
        
        // Temporarily adjust canvas wrapper for cleaner export
        const oldOver = bgContainer.style.overflow;
        bgContainer.style.overflow = 'visible';
        
        html2canvas(document.getElementById('canvas'), {
            backgroundColor: document.body.classList.contains('light-mode') ? '#f8fafc' : '#0f172a', /* dynamic --bg-dark */
            windowWidth: bgContainer.scrollWidth,
            windowHeight: bgContainer.scrollHeight,
            width: bgContainer.scrollWidth,
            height: bgContainer.scrollHeight
        }).then(canvasElem => {
            bgContainer.style.overflow = oldOver;
            canvasElem.toBlob(blob => {
                downloadBlob(blob, 'diagram.png');
            });
        }).catch(err => {
            console.error('Export failed:', err);
            bgContainer.style.overflow = oldOver;
            alert('Failed to export image.');
        });
    });

    // Import .mino
    const importBtn = document.getElementById('import-btn');
    document.getElementById('import-trigger').addEventListener('click', () => {
        importBtn.click();
    });

    function parseMinoDataObj(data) {
        clearCanvasBoard();
        window.isUndoRedoing = true; // prevent nested loops
        window.isPastingMode = true; // Use precise x/y bounds stored in JSON
        
        let maxShapeCount = 0;
        data.shapes.forEach(sData => {
            const parts = sData.id.split('-');
            if (parts.length > 2) maxShapeCount = Math.max(maxShapeCount, parseInt(parts[2]));
            
            // Create basic shape
            createShape(sData.type, sData.x, sData.y); 
            const shape = shapes[sData.id] || Object.values(shapes).pop();
            
            // Restore properties exactly
            shape.id = sData.id;
            shape.style.left = sData.x + 'px';
            shape.style.top = sData.y + 'px';
            shape.style.width = sData.w + 'px';
            shape.style.height = sData.h + 'px';
            shape.style.backgroundColor = sData.fill;
            
            const span = shape.querySelector('.shape-text');
            span.innerHTML = sData.text;
            span.style.color = sData.textColor;
            span.style.fontSize = sData.textSize;
            
            // Fix ID in map map
            delete shapes[Object.keys(shapes).pop()];
            shapes[sData.id] = shape;
        });
        shapeCount = maxShapeCount;
        
        // Reconstruct Connections
        data.connections.forEach(cData => {
            createLine(cData.start, cData.end);
            const conn = connections[connections.length - 1];
            conn.id = cData.id;
            conn.dir = cData.dir;
            conn.labelNode.innerHTML = cData.text;
            conn.labelNode.style.color = cData.textColor;
            conn.labelNode.style.fontSize = cData.textSize;
            if (cData.bendPoint) conn.bendPoint = cData.bendPoint;
            applyLineMarkers(conn);
        });
        
        updateAllPaths();
        window.isPastingMode = false;
        window.isUndoRedoing = false;
    }

    importBtn.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                parseMinoDataObj(data);
                saveState();
                importBtn.value = ''; // reset
            } catch (err) {
                console.error(err);
                alert('Invalid .mino file.');
            }
        };
        reader.readAsText(file);
    });

    // --- State History Stack (Undo/Redo) ---
    let stateHistory = [];
    let stateIdx = -1;
    function saveState() {
        if (window.isUndoRedoing) return; // don't track state during parsing
        stateHistory.splice(stateIdx + 1); // Delete future if mutating on a past state
        stateHistory.push(JSON.stringify(getMinoData()));
        if (stateHistory.length > 30) stateHistory.shift(); // Max 30 saves
        else stateIdx++;
    }
    function undo() {
        if (stateIdx > 0) {
            stateIdx--;
            parseMinoDataObj(JSON.parse(stateHistory[stateIdx]));
        }
    }
    function redo() {
        if (stateIdx < stateHistory.length - 1) {
            stateIdx++;
            parseMinoDataObj(JSON.parse(stateHistory[stateIdx]));
        }
    }
    
    // Initial State Save
    setTimeout(() => saveState(), 100);

    // Auto-save on page refresh/unload
    window.addEventListener('beforeunload', (e) => {
        if (Object.keys(shapes).length > 0 || connections.length > 0) {
            const data = getMinoData();
            const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
            downloadBlob(blob, 'backup_diagram.mino');
        }
    });
});
