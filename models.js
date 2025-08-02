/**
 * Data models for the railway simulation
 * Implements Station, Track, Train, and Passenger entities
 */

let nextId = 1;

/**
 * Station class - represents a station where passengers spawn and board trains
 */
export class Station {
    constructor(x, y, importance = 3) {
        this.id = nextId++;
        this.x = x;
        this.y = y;
        this.importance = Math.max(1, Math.min(3, importance)); // Clamp to 1-3 (1=Major Hub, 2=Regional, 3=Local)
        this.waiting = []; // Array of waiting passengers
        this.name = this.generateStationName();
        this.color = this.generateRandomColor();
        this.lastSpawn = 0; // Last passenger spawn time
    }
    
    /**
     * Generate a random station name
     */
    generateStationName() {
        const prefixes = ['Central', 'North', 'South', 'East', 'West', 'Downtown', 'Uptown', 'Old', 'New'];
        const suffixes = ['Station', 'Terminal', 'Junction', 'Plaza', 'Square', 'Cross', 'Point', 'Park'];
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
        return `${prefix} ${suffix}`;
    }
    
    /**
     * Generate a random vibrant color for the station
     */
    generateRandomColor() {
        const colors = [
            '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
            '#1abc9c', '#e67e22', '#34495e', '#16a085', '#27ae60',
            '#2980b9', '#8e44ad', '#2c3e50', '#f1c40f', '#d35400',
            '#c0392b', '#7f8c8d', '#95a5a6', '#ff6b6b', '#4ecdc4',
            '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd', '#98d8c8'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    /**
     * Get the display size based on importance (1=largest, 3=smallest)
     */
    getSize() {
        switch (this.importance) {
            case 1: return 20; // Major Hub - largest
            case 2: return 15; // Regional Station - medium
            case 3: return 12; // Local Stop - smallest
            default: return 15;
        }
    }
    
    /**
     * Get importance level description
     */
    getImportanceLabel() {
        switch (this.importance) {
            case 1: return 'Major Hub';
            case 2: return 'Regional Station';
            case 3: return 'Local Stop';
            default: return 'Unknown';
        }
    }
    
    /**
     * Add a passenger to the waiting queue
     */
    addPassenger(passenger) {
        this.waiting.push(passenger);
    }
    
    /**
     * Remove passengers that board a train
     */
    removePassengers(passengers) {
        for (const passenger of passengers) {
            const index = this.waiting.indexOf(passenger);
            if (index > -1) {
                this.waiting.splice(index, 1);
            }
        }
    }
    
    /**
     * Get passengers waiting for a specific destination
     */
    getPassengersFor(destinationId) {
        return this.waiting.filter(p => p.dest === destinationId);
    }
}

/**
 * Track class - represents a connection between two stations
 */
export class Track {
    constructor(fromStationId, toStationId, stations) {
        this.from = fromStationId;
        this.to = toStationId;
        
        // Calculate track properties
        const fromStation = stations.find(s => s.id === fromStationId);
        const toStation = stations.find(s => s.id === toStationId);
        
        if (!fromStation || !toStation) {
            throw new Error('Invalid station IDs for track');
        }
        
        const dx = toStation.x - fromStation.x;
        const dy = toStation.y - fromStation.y;
        this.length = Math.sqrt(dx * dx + dy * dy);
        this.maxSpeed = 200; // pixels per second
        
        // Store coordinates for rendering
        this.x1 = fromStation.x;
        this.y1 = fromStation.y;
        this.x2 = toStation.x;
        this.y2 = toStation.y;
    }
    
    /**
     * Get the other station ID given one station ID
     */
    getOtherStation(stationId) {
        return stationId === this.from ? this.to : this.from;
    }
    
    /**
     * Check if this track connects the given stations
     */
    connects(station1Id, station2Id) {
        return (this.from === station1Id && this.to === station2Id) ||
               (this.from === station2Id && this.to === station1Id);
    }
    
    /**
     * Get position along track given parameter t (0 to 1)
     */
    getPosition(t) {
        t = Math.max(0, Math.min(1, t)); // Clamp to [0, 1]
        return {
            x: this.x1 + (this.x2 - this.x1) * t,
            y: this.y1 + (this.y2 - this.y1) * t
        };
    }
}

/**
 * Train class - represents a train that moves along tracks carrying passengers
 */
export class Train {
    constructor(route, maxCapacity = 20) {
        this.id = nextId++;
        this.route = [...route]; // Array of station IDs defining the route
        this.speed = 150; // pixels per second
        this.maxCapacity = maxCapacity;
        this.onboard = []; // Passengers currently on the train
        
        // Position tracking
        this.pos = {
            currentTrack: null, // Track object the train is on
            t: 0, // Position parameter along track (0-1)
            fromStation: route[0], // Station we're moving from
            toStation: route[1] || route[0], // Station we're moving to
            routeIndex: 0 // Current position in route
        };
        
        // For simple shuttles, track which station we're heading toward
        this.currentStation = route[0]; // Which station the train is currently at/near
        this.targetStation = route[1] || route[0]; // Which station we're heading to
        
        this.direction = 1; // 1 for forward, -1 for backward along route
        this.moveDirection = 1; // 1 for moving toward t=1, -1 for moving toward t=0
        this.waiting = false; // True when waiting at a station
        this.waitTime = 0; // Time spent waiting at current station
        this.waitDuration = 1000; // How long to wait at stations (ms)
    }
    
    /**
     * Set the current track the train is on
     */
    setTrack(track) {
        this.pos.currentTrack = track;
    }
    
    /**
     * Add passengers to the train
     */
    boardPassengers(passengers) {
        const availableSpace = this.maxCapacity - this.onboard.length;
        const toBoard = passengers.slice(0, availableSpace);
        
        for (const passenger of toBoard) {
            passenger.board(); // Use the proper boarding method
            this.onboard.push(passenger);
        }
        
        return toBoard;
    }
    
    /**
     * Remove passengers from the train
     */
    alightPassengers(stationId) {
        const alighting = this.onboard.filter(p => p.dest === stationId);
        this.onboard = this.onboard.filter(p => p.dest !== stationId);
        
        for (const passenger of alighting) {
            passenger.arrive(); // Use the proper arrival method
        }
        
        return alighting;
    }
    
    /**
     * Get current position on the canvas
     */
    getPosition() {
        if (!this.pos.currentTrack) {
            return { x: 0, y: 0 };
        }
        return this.pos.currentTrack.getPosition(this.pos.t);
    }
    
    /**
     * Check if train is at a station
     */
    isAtStation() {
        return this.pos.t === 0.0 || this.pos.t === 1.0; // Exact match only
    }
    
    /**
     * Get the current station ID if at a station
     */
    getCurrentStation() {
        if (this.pos.t === 0.0) {
            // When at t=0, return the correct station based on movement direction
            return this.moveDirection === 1 ? this.pos.fromStation : this.pos.toStation;
        } else if (this.pos.t === 1.0) {
            // When at t=1, return the correct station based on movement direction
            return this.moveDirection === 1 ? this.pos.toStation : this.pos.fromStation;
        }
        return null;
    }
}

/**
 * Passenger class - represents individual passengers with origin, destination, and state
 */
export class Passenger {
    constructor(origin, destination) {
        this.id = nextId++;
        this.origin = origin;
        this.dest = destination;
        this.state = 'waiting'; // 'waiting', 'onboard', 'arrived'
        this.spawn = Date.now(); // Timestamp when passenger was created
        this.boardTime = null; // When passenger boarded a train
        this.arrivalTime = null; // When passenger arrived at destination
    }
    
    /**
     * Get total travel time from spawn to arrival
     */
    getTotalTravelTime() {
        if (this.state !== 'arrived' || !this.arrivalTime) {
            return 0;
        }
        return this.arrivalTime - this.spawn;
    }
    
    /**
     * Get waiting time before boarding
     */
    getWaitingTime() {
        const endTime = this.boardTime || Date.now();
        return endTime - this.spawn;
    }
    
    /**
     * Mark passenger as boarded
     */
    board() {
        this.state = 'onboard';
        this.boardTime = Date.now();
    }
    
    /**
     * Mark passenger as arrived
     */
    arrive() {
        this.state = 'arrived';
        this.arrivalTime = Date.now();
    }
}

/**
 * Utility function to calculate distance between two points
 */
export function distance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Utility function to calculate distance between two stations
 */
export function stationDistance(station1, station2) {
    return distance(station1.x, station1.y, station2.x, station2.y);
} 