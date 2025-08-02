/**
 * Main game logic and entry point for railway simulation
 * Handles game state, simulation loop, rendering, and core mechanics
 */

import { Station, Track, Train, Passenger, stationDistance } from './models.js';
import { Graph, buildRoutingTable, getPath, hasPath } from './graph.js';
import { UIManager } from './ui.js';

class RailwayGame {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Game state
        this.stations = [];
        this.tracks = [];
        this.trains = [];
        this.allPassengers = []; // All passengers (waiting, onboard, arrived)
        
        // Simulation state
        this.graph = new Graph();
        this.routingTable = new Map();
        this.simulationSpeed = 1.0;
        this.lastTime = 0;
        this.isRunning = false;
        
        // Passenger spawning
        this.passengerSpawnRate = 0.5; // Base passengers per second per importance point
        
        // Initialize UI
        this.ui = new UIManager(canvas, this);
        
        // Setup canvas
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Start the game loop
        this.start();
    }
    
    /**
     * Resize canvas to fit window
     */
    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    /**
     * Start the game loop
     */
    start() {
        this.isRunning = true;
        this.lastTime = performance.now();
        this.gameLoop();
    }
    
    /**
     * Stop the game loop
     */
    stop() {
        this.isRunning = false;
    }
    
    /**
     * Set simulation speed multiplier
     */
    setSimulationSpeed(speed) {
        this.simulationSpeed = Math.max(0, Math.min(2, speed));
    }
    
    /**
     * Main game loop - runs at 60 FPS
     */
    gameLoop() {
        if (!this.isRunning) return;
        
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastTime) * this.simulationSpeed;
        this.lastTime = currentTime;
        
        // Update simulation
        this.update(deltaTime);
        
        // Render everything
        this.render();
        
        // Update UI statistics
        this.updateStats();
        
        // Continue loop
        requestAnimationFrame(() => this.gameLoop());
    }
    
    /**
     * Update simulation state
     */
    update(deltaTime) {
        if (deltaTime <= 0) return;
        
        // Spawn passengers at stations
        this.spawnPassengers(deltaTime);
        
        // Alight passengers at destinations (before boarding new ones)
        this.alightPassengers();
        
        // Board passengers onto trains
        this.boardPassengers();
        
        // Move trains after boarding/alighting
        this.updateTrains(deltaTime);
    }
    
    /**
     * Spawn passengers at stations based on importance
     */
    spawnPassengers(deltaTime) {
        const currentTime = Date.now();
        
        for (const station of this.stations) {
            // Calculate spawn rate based on importance (1=highest rate, 3=lowest rate)
            const importanceMultiplier = 4 - station.importance; // 1->3, 2->2, 3->1
            const spawnRate = this.passengerSpawnRate * importanceMultiplier;
            const timeSinceLastSpawn = currentTime - station.lastSpawn;
            const spawnInterval = 1000 / spawnRate; // milliseconds between spawns
            
            if (timeSinceLastSpawn >= spawnInterval) {
                // Choose destination using gravity model
                const destination = this.chooseDestination(station);
                if (destination && destination.id !== station.id) {
                    const passenger = new Passenger(station.id, destination.id);
                    station.addPassenger(passenger);
                    this.allPassengers.push(passenger);
                    station.lastSpawn = currentTime;
                }
            }
        }
    }
    
    /**
     * Choose passenger destination using gravity model
     */
    chooseDestination(originStation) {
        if (this.stations.length <= 1) return null;
        
        const candidates = this.stations.filter(s => s.id !== originStation.id);
        const weights = [];
        
        // Calculate weights: importance / distance^2 (1=highest weight, 3=lowest weight)
        for (const station of candidates) {
            const distance = stationDistance(originStation, station);
            const importanceWeight = 4 - station.importance; // 1->3, 2->2, 3->1
            const weight = importanceWeight / Math.max(1, distance * distance / 10000); // Scale distance
            weights.push(weight);
        }
        
        // Weighted random selection
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        if (totalWeight === 0) return candidates[0];
        
        let random = Math.random() * totalWeight;
        for (let i = 0; i < candidates.length; i++) {
            random -= weights[i];
            if (random <= 0) {
                return candidates[i];
            }
        }
        
        return candidates[candidates.length - 1];
    }
    
    /**
     * Update train positions and states
     */
    updateTrains(deltaTime) {
        for (const train of this.trains) {
            if (train.waiting) {
                // Handle waiting at station
                train.waitTime += deltaTime;
                if (train.waitTime >= train.waitDuration) {
                    train.waiting = false;
                    train.waitTime = 0;
                    this.moveTrainToNextSegment(train);
                }
            } else {
                // Move along track only if we have a valid track
                if (train.pos.currentTrack) {
                    this.moveTrainAlongTrack(train, deltaTime);
                }
            }
        }
    }
    
    /**
     * Move train along its current track
     */
    moveTrainAlongTrack(train, deltaTime) {
        if (!train.pos.currentTrack) return;
        
        const distance = (train.speed * deltaTime) / 1000; // pixels per millisecond to pixels
        const trackLength = train.pos.currentTrack.length;
        const deltaT = distance / trackLength;
        
        // Use moveDirection for track movement (not route direction)
        const newT = train.pos.t + deltaT * (train.moveDirection || 1);
        
        // Check if reached end of track before updating position
        if (newT >= 1.0 || newT <= 0.0) {
            // Clamp to exact end and start waiting
            const finalT = newT >= 1.0 ? 1.0 : 0.0;
            train.pos.t = finalT;
            train.waiting = true;
            train.waitTime = 0;
            
            // Determine which station we arrived at based on movement direction
            let arrivedAt;
            if (train.moveDirection === 1) {
                // Moving forward: t=0 → fromStation, t=1 → toStation
                arrivedAt = finalT === 1.0 ? train.pos.toStation : train.pos.fromStation;
            } else {
                // Moving backward: t=1 → fromStation, t=0 → toStation
                arrivedAt = finalT === 0.0 ? train.pos.toStation : train.pos.fromStation;
            }
            
            console.log(`🏁 Train ${train.id}: Arrived at station ${arrivedAt} (t=${finalT}, moveDirection=${train.moveDirection})`);
        } else {
            // Safe to move - not at station yet
            train.pos.t = newT;
        }
    }
    
    /**
     * Move train to next segment of its route
     */
    moveTrainToNextSegment(train) {
        const currentStationId = train.getCurrentStation();
        if (!currentStationId) return;
        
        // For simple shuttle routes (most common case), handle explicitly
        if (train.route.length === 2) {
            const [stationA, stationB] = train.route;
            
            // Get current station using the fixed logic
            const currentStationId = train.getCurrentStation();
            
            // Simple shuttle logic: alternate between the two stations
            train.currentStation = currentStationId;
            train.targetStation = train.currentStation === stationA ? stationB : stationA;
            
            console.log(`🔄 Shuttle: ${train.currentStation} -> ${train.targetStation}`);
            
            const track = this.findTrack(train.currentStation, train.targetStation);
            if (track) {
                train.setTrack(track);
                train.pos.fromStation = train.currentStation;
                train.pos.toStation = train.targetStation;
                
                // Set correct starting position and direction based on track orientation
                if (track.from === train.currentStation) {
                    train.pos.t = 0.01;
                    train.moveDirection = 1;
                } else {
                    train.pos.t = 0.99;
                    train.moveDirection = -1;
                }
            } else {
                console.log(`   ❌ No track found between ${train.currentStation} and ${train.targetStation}!`);
            }
            return;
        }
        
        // Handle longer routes with proper direction tracking
        const currentIndex = train.route.indexOf(currentStationId);
        if (currentIndex === -1) return;
        
        let nextIndex;
        
        if (train.direction === 1) {
            nextIndex = currentIndex + 1;
            if (nextIndex >= train.route.length) {
                train.direction = -1;
                nextIndex = currentIndex - 1;
            }
        } else {
            nextIndex = currentIndex - 1;
            if (nextIndex < 0) {
                train.direction = 1;
                nextIndex = currentIndex + 1;
            }
        }
        
        if (nextIndex >= 0 && nextIndex < train.route.length) {
            const nextStationId = train.route[nextIndex];
            const track = this.findTrack(currentStationId, nextStationId);
            
            if (track) {
                train.setTrack(track);
                train.pos.fromStation = currentStationId;
                train.pos.toStation = nextStationId;
                
                if (track.from === currentStationId) {
                    train.pos.t = 0.01;
                    train.moveDirection = 1;
                } else {
                    train.pos.t = 0.99;
                    train.moveDirection = -1;
                }
            }
        }
    }
    
    /**
     * Handle passenger boarding
     */
    boardPassengers() {
        for (const train of this.trains) {
            if (!train.waiting) continue;
            
            const currentStationId = train.getCurrentStation();
            if (!currentStationId) continue;
            
            const station = this.stations.find(s => s.id === currentStationId);
            if (!station) continue;
            
            // Find passengers who can board this train
            const boardablePassengers = station.waiting.filter(passenger => {
                return this.canTrainReachDestination(train, passenger.dest);
            });
            
            // Board passengers up to capacity
            const boarded = train.boardPassengers(boardablePassengers);
            
            // Remove boarded passengers from station
            station.removePassengers(boarded);
        }
    }
    
    /**
     * Check if train can reach a destination
     */
    canTrainReachDestination(train, destinationId) {
        return train.route.includes(destinationId);
    }
    
    /**
     * Handle passenger alighting
     */
    alightPassengers() {
        for (const train of this.trains) {
            if (!train.waiting) continue;
            
            const currentStationId = train.getCurrentStation();
            if (!currentStationId) continue;
            
            // Passengers alight at their destination
            const alighted = train.alightPassengers(currentStationId);
        }
    }
    
    /**
     * Add a new station
     */
    addStation(station) {
        this.stations.push(station);
        this.graph.addNode(station.id);
        this.rebuildRoutingTable();
    }
    
    /**
     * Change the importance of an existing station
     */
    changeStationImportance(stationId, newImportance) {
        const station = this.stations.find(s => s.id === stationId);
        if (station) {
            station.importance = Math.max(1, Math.min(3, newImportance));
            // Reset spawn timer to apply new rate immediately
            station.lastSpawn = 0;
        }
    }
    
    /**
     * Delete a station and all its connections
     */
    deleteStation(stationId) {
        const stationIndex = this.stations.findIndex(s => s.id === stationId);
        if (stationIndex === -1) return false;
        
        // Remove all tracks connected to this station
        this.tracks = this.tracks.filter(track => 
            track.from !== stationId && track.to !== stationId
        );
        
        // Remove all trains that use this station in their route
        this.trains = this.trains.filter(train => 
            !train.route.includes(stationId)
        );
        
        // Remove all passengers waiting at or going to this station
        const station = this.stations[stationIndex];
        this.allPassengers = this.allPassengers.filter(passenger => 
            passenger.origin !== stationId && passenger.dest !== stationId
        );
        
        // Remove station
        this.stations.splice(stationIndex, 1);
        
        // Update graph and routing
        this.graph.removeNode(stationId);
        this.rebuildRoutingTable();
        
        return true;
    }
    
    /**
     * Add a new track between stations
     */
    addTrack(fromId, toId) {
        // Check if track already exists
        const existingTrack = this.tracks.find(t => t.connects(fromId, toId));
        if (existingTrack) {
            return false;
        }
        
        const track = new Track(fromId, toId, this.stations);
        this.tracks.push(track);
        this.graph.addEdge(fromId, toId, track.length);
        this.rebuildRoutingTable();
        return true;
    }
    
    /**
     * Add a new train
     */
    addTrain(fromId, toId) {
        // Check if path exists
        if (!hasPath(this.routingTable, fromId, toId)) {
            return false;
        }
        
        const path = getPath(this.routingTable, fromId, toId);
        const train = new Train(path);
        
        // Set initial track - start at the first station
        if (path.length >= 2) {
            // For shuttles, initialize the current/target station tracking
            train.currentStation = path[0];
            train.targetStation = path[1];
            
            console.log(`🆕 Created Train ${train.id}: Route [${path.join(' ↔ ')}]`);
            
            const firstTrack = this.findTrack(path[0], path[1]);
            if (firstTrack) {
                train.setTrack(firstTrack);
                train.pos.fromStation = path[0];
                train.pos.toStation = path[1];
                train.pos.routeIndex = 0;
                
                // Set correct starting position and direction
                if (firstTrack.from === path[0]) {
                    train.pos.t = 0.0;
                    train.moveDirection = 1; // Move toward t=1
                } else {
                    train.pos.t = 1.0;
                    train.moveDirection = -1; // Move toward t=0
                }
                
                // Start waiting at the initial station
                train.waiting = true;
                train.waitTime = 0;
            }
        }
        
        this.trains.push(train);
        return true;
    }
    
    /**
     * Find track between two stations
     */
    findTrack(stationId1, stationId2) {
        return this.tracks.find(t => t.connects(stationId1, stationId2));
    }
    
    /**
     * Rebuild routing table when tracks change
     */
    rebuildRoutingTable() {
        this.routingTable = buildRoutingTable(this.graph);
    }
    
    /**
     * Render the entire game
     */
    render() {
        // Clear canvas
        this.ctx.fillStyle = '#34495e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Render tracks
        this.renderTracks();
        
        // Render stations
        this.renderStations();
        
        // Render trains
        this.renderTrains();
        
        // Render UI overlays
        this.renderUIOverlays();
    }
    
    /**
     * Render all tracks
     */
    renderTracks() {
        this.ctx.strokeStyle = '#95a5a6';
        this.ctx.lineWidth = 3;
        
        for (const track of this.tracks) {
            this.ctx.beginPath();
            this.ctx.moveTo(track.x1, track.y1);
            this.ctx.lineTo(track.x2, track.y2);
            this.ctx.stroke();
        }
    }
    
    /**
     * Render all stations
     */
    renderStations() {
        for (const station of this.stations) {
            this.renderStation(station);
        }
    }
    
    /**
     * Render a single station
     */
    renderStation(station) {
        const isSelected = this.ui.isStationSelected(station);
        const isHovered = this.ui.getHoveredStation() === station;
        const stationSize = station.getSize();
        
        // Station circle - use random color or override for interaction states
        this.ctx.fillStyle = station.color;
        if (isSelected) {
            this.ctx.fillStyle = '#ff4757'; // Bright red for selection
        } else if (isHovered) {
            this.ctx.fillStyle = '#ffa502'; // Orange for hover
        }
        
        this.ctx.beginPath();
        this.ctx.arc(station.x, station.y, stationSize, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Station border
        this.ctx.strokeStyle = '#2c3e50';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        // Station name (abbreviated for space)
        this.ctx.fillStyle = 'white';
        this.ctx.font = `${Math.max(8, stationSize - 6)}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // Show abbreviated name or just first letter for small stations
        let displayText = station.name;
        if (stationSize < 15) {
            displayText = station.name.charAt(0); // Just first letter for small stations
        } else if (displayText.length > 8) {
            displayText = displayText.split(' ').map(word => word.charAt(0)).join(''); // Initials
        }
        
        this.ctx.fillText(displayText, station.x, station.y);
        
        // Waiting passengers indicator
        if (station.waiting.length > 0) {
            this.ctx.fillStyle = '#e67e22';
            this.ctx.font = '10px Arial';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(station.waiting.length.toString(), station.x + stationSize + 5, station.y - stationSize + 5);
        }
        
        // Importance indicator (small dot)
        if (isHovered || isSelected) {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            this.ctx.font = '9px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(station.getImportanceLabel(), station.x, station.y + stationSize + 15);
        }
    }
    

    
    /**
     * Render all trains
     */
    renderTrains() {
        for (const train of this.trains) {
            this.renderTrain(train);
        }
    }
    
    /**
     * Render a single train
     */
    renderTrain(train) {
        const pos = train.getPosition();
        
        // Train body
        this.ctx.fillStyle = '#e74c3c';
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, 8, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Train border
        this.ctx.strokeStyle = '#c0392b';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        // Passenger count
        if (train.onboard.length > 0) {
            this.ctx.fillStyle = 'white';
            this.ctx.font = '8px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(train.onboard.length.toString(), pos.x, pos.y + 2);
        }
    }
    
    /**
     * Render UI overlays (preview lines, etc.)
     */
    renderUIOverlays() {
        const selectedStation = this.ui.getSelectedStation();
        const mousePos = this.ui.getMousePosition();
        
        // Draw preview line for track tool
        if (this.ui.currentTool === 'track' && selectedStation) {
            this.ctx.strokeStyle = '#f39c12';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            this.ctx.moveTo(selectedStation.x, selectedStation.y);
            this.ctx.lineTo(mousePos.x, mousePos.y);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
    }
    
    /**
     * Update and display statistics
     */
    updateStats() {
        const totalPassengers = this.allPassengers.length;
        const waitingPassengers = this.allPassengers.filter(p => p.state === 'waiting');
        const avgWaitTime = waitingPassengers.length > 0 
            ? waitingPassengers.reduce((sum, p) => sum + p.getWaitingTime(), 0) / waitingPassengers.length / 1000
            : 0;
        
        const stats = {
            totalPassengers,
            avgWaitTime,
            stationCount: this.stations.length,
            trainCount: this.trains.length
        };
        
        this.ui.updateHUD(stats);
    }
}

// Initialize the game when the page loads
window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    new RailwayGame(canvas);
}); 