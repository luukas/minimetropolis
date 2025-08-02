/**
 * UI system for railway simulation
 * Handles mouse events, toolbar interactions, and tool switching
 */

import { Station, Track, Train, stationDistance } from './models.js';

export class UIManager {
    constructor(canvas, game) {
        this.canvas = canvas;
        this.game = game;
        this.currentTool = 'station';
        this.selectedStation = null; // For track and train tools
        this.settingsSelectedStation = null; // For station settings panel
        this.hoveredStation = null;
        this.mousePos = { x: 0, y: 0 };
        
        this.setupEventListeners();
        this.setupToolbar();
        this.setupHUD();
        this.setupStationSettings();
    }
    
    /**
     * Set up mouse and keyboard event listeners
     */
    setupEventListeners() {
        // Mouse events
        this.canvas.addEventListener('click', (e) => this.handleClick(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }
    
    /**
     * Set up toolbar buttons
     */
    setupToolbar() {
        const stationTool = document.getElementById('stationTool');
        const trackTool = document.getElementById('trackTool');
        const trainTool = document.getElementById('trainTool');
        
        stationTool.addEventListener('click', () => this.setTool('station'));
        trackTool.addEventListener('click', () => this.setTool('track'));
        trainTool.addEventListener('click', () => this.setTool('train'));
    }
    
    /**
     * Set up HUD controls
     */
    setupHUD() {
        const speedSlider = document.getElementById('speedSlider');
        const speedValue = document.getElementById('speedValue');
        
        speedSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.game.setSimulationSpeed(value);
            speedValue.textContent = `${value.toFixed(1)}x`;
        });
    }
    
    /**
     * Set up station settings panel
     */
    setupStationSettings() {
        const importanceSelect = document.getElementById('importanceSelect');
        const deleteButton = document.getElementById('deleteStation');
        const deselectButton = document.getElementById('deselectStation');
        
        importanceSelect.addEventListener('change', (e) => {
            if (this.settingsSelectedStation) {
                const newImportance = parseInt(e.target.value);
                this.game.changeStationImportance(this.settingsSelectedStation.id, newImportance);
                this.updateStationSettingsPanel();
            }
        });
        
        deleteButton.addEventListener('click', () => {
            if (this.settingsSelectedStation) {
                this.game.deleteStation(this.settingsSelectedStation.id);
                this.hideStationSettings();
            }
        });
        
        deselectButton.addEventListener('click', () => {
            this.hideStationSettings();
        });
    }
    
    /**
     * Switch to a different tool
     */
    setTool(toolName) {
        this.currentTool = toolName;
        this.selectedStation = null;
        this.hideStationSettings(); // Hide settings when switching tools
        this.updateToolButtons();
        this.updateStatus();
    }
    
    /**
     * Update toolbar button states
     */
    updateToolButtons() {
        const buttons = {
            'station': document.getElementById('stationTool'),
            'track': document.getElementById('trackTool'),
            'train': document.getElementById('trainTool')
        };
        
        for (const [tool, button] of Object.entries(buttons)) {
            if (tool === this.currentTool) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        }
    }
    
    /**
     * Handle mouse click events
     */
    handleClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        switch (this.currentTool) {
            case 'station':
                this.handleStationClick(x, y, event);
                break;
            case 'track':
                this.handleTrackClick(x, y);
                break;
            case 'train':
                this.handleTrainClick(x, y);
                break;
        }
    }
    
    /**
     * Handle mouse move events
     */
    handleMouseMove(event) {
        const rect = this.canvas.getBoundingClientRect();
        this.mousePos.x = event.clientX - rect.left;
        this.mousePos.y = event.clientY - rect.top;
        
        // Update hovered station
        this.hoveredStation = this.findStationNear(this.mousePos.x, this.mousePos.y, 25);
        
        // Update cursor
        this.updateCursor();
    }
    
    /**
     * Handle keyboard events
     */
    handleKeyboard(event) {
        switch (event.key) {
            case '1':
                this.setTool('station');
                break;
            case '2':
                this.setTool('track');
                break;
            case '3':
                this.setTool('train');
                break;
            case 'Escape':
                this.selectedStation = null;
                this.updateStatus();
                break;
        }
    }
    
    /**
     * Handle station tool clicks
     */
    handleStationClick(x, y, event) {
        // Check if clicking on an existing station
        const existingStation = this.findStationNear(x, y, 25);
        if (existingStation) {
            // Show station settings
            this.showStationSettings(existingStation);
            return;
        }
        
        // Hide settings panel when clicking empty space
        this.hideStationSettings();
        
        // Create new station with default importance
        const station = new Station(x, y, 3); // Default: Local Stop
        this.game.addStation(station);
        this.updateStatus(`${station.name} (${station.getImportanceLabel()}) created`);
    }
    
    /**
     * Handle track tool clicks
     */
    handleTrackClick(x, y) {
        const clickedStation = this.findStationNear(x, y, 25);
        
        if (!clickedStation) {
            this.updateStatus('Click on a station to connect tracks');
            return;
        }
        
        if (!this.selectedStation) {
            // First station selected
            this.selectedStation = clickedStation;
            this.updateStatus(`Station ${clickedStation.id} selected. Click another station to connect.`);
        } else if (this.selectedStation.id === clickedStation.id) {
            // Same station clicked - deselect
            this.selectedStation = null;
            this.updateStatus('Station deselected. Click on a station to start connecting.');
        } else {
            // Second station selected - create track
            const success = this.game.addTrack(this.selectedStation.id, clickedStation.id);
            if (success) {
                this.updateStatus(`Track created between Station ${this.selectedStation.id} and Station ${clickedStation.id}`);
            } else {
                this.updateStatus('Track already exists between these stations');
            }
            this.selectedStation = null;
        }
    }
    
    /**
     * Handle train tool clicks
     */
    handleTrainClick(x, y) {
        const clickedStation = this.findStationNear(x, y, 25);
        
        if (!clickedStation) {
            this.updateStatus('Click on a station to place train route');
            return;
        }
        
        if (!this.selectedStation) {
            // First station selected
            this.selectedStation = clickedStation;
            this.updateStatus(`Origin station ${clickedStation.id} selected. Click destination station.`);
        } else if (this.selectedStation.id === clickedStation.id) {
            // Same station clicked - deselect
            this.selectedStation = null;
            this.updateStatus('Origin deselected. Click on a station to start train route.');
        } else {
            // Second station selected - create train
            const success = this.game.addTrain(this.selectedStation.id, clickedStation.id);
            if (success) {
                this.updateStatus(`Train created from Station ${this.selectedStation.id} to Station ${clickedStation.id}`);
            } else {
                this.updateStatus('Cannot create train: no path exists between stations');
            }
            this.selectedStation = null;
        }
    }
    
    /**
     * Find station near given coordinates
     */
    findStationNear(x, y, defaultRadius = 25) {
        for (const station of this.game.stations) {
            const distance = stationDistance({ x, y }, station);
            const stationSize = station.getSize();
            const clickRadius = Math.max(defaultRadius, stationSize + 5); // Use station size or default
            if (distance <= clickRadius) {
                return station;
            }
        }
        return null;
    }
    
    /**
     * Update cursor based on current tool and hover state
     */
    updateCursor() {
        let cursor = 'crosshair';
        
        if (this.hoveredStation) {
            cursor = 'pointer';
        } else if (this.currentTool === 'station') {
            cursor = 'crosshair';
        } else if (this.currentTool === 'track' || this.currentTool === 'train') {
            cursor = 'crosshair';
        }
        
        this.canvas.style.cursor = cursor;
    }
    
    /**
     * Update status text
     */
    updateStatus(message = null) {
        const statusEl = document.getElementById('statusText');
        
        if (message) {
            statusEl.textContent = message;
            return;
        }
        
        let status = '';
        switch (this.currentTool) {
            case 'station':
                status = 'Click empty space to create Local Stop | Click existing station for settings';
                break;
            case 'track':
                if (this.selectedStation) {
                    status = `Station ${this.selectedStation.id} selected. Click another station to connect.`;
                } else {
                    status = 'Click on a station to start connecting tracks';
                }
                break;
            case 'train':
                if (this.selectedStation) {
                    status = `Origin station ${this.selectedStation.id} selected. Click destination station.`;
                } else {
                    status = 'Click origin station, then destination station to create train';
                }
                break;
        }
        
        statusEl.textContent = status;
    }
    
    /**
     * Update HUD statistics
     */
    updateHUD(stats) {
        document.getElementById('totalPassengers').textContent = stats.totalPassengers;
        document.getElementById('avgWaitTime').textContent = `${stats.avgWaitTime.toFixed(1)}s`;
        document.getElementById('stationCount').textContent = stats.stationCount;
        document.getElementById('trainCount').textContent = stats.trainCount;
    }
    
    /**
     * Get current mouse position
     */
    getMousePosition() {
        return { ...this.mousePos };
    }
    
    /**
     * Get currently selected station (for track/train tools)
     */
    getSelectedStation() {
        return this.selectedStation;
    }
    
    /**
     * Get currently hovered station
     */
    getHoveredStation() {
        return this.hoveredStation;
    }
    
    /**
     * Check if a station is selected
     */
    isStationSelected(station) {
        return (this.selectedStation && this.selectedStation.id === station.id) ||
               (this.settingsSelectedStation && this.settingsSelectedStation.id === station.id);
    }
    
    /**
     * Show station settings panel
     */
    showStationSettings(station) {
        this.settingsSelectedStation = station;
        this.updateStationSettingsPanel();
        document.getElementById('stationSettings').style.display = 'block';
        this.updateStatus(`Settings for ${station.name}`);
    }
    
    /**
     * Hide station settings panel
     */
    hideStationSettings() {
        this.settingsSelectedStation = null;
        document.getElementById('stationSettings').style.display = 'none';
        this.updateStatus();
    }
    
    /**
     * Update station settings panel content
     */
    updateStationSettingsPanel() {
        if (!this.settingsSelectedStation) return;
        
        const station = this.settingsSelectedStation;
        document.getElementById('stationName').textContent = station.name;
        document.getElementById('importanceSelect').value = station.importance.toString();
    }
} 