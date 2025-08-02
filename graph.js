/**
 * Graph algorithms for railway simulation
 * Implements Dijkstra's algorithm for shortest path finding
 */

/**
 * Graph class to represent the railway network
 */
export class Graph {
    constructor() {
        this.nodes = new Set(); // Station IDs
        this.edges = new Map(); // Station ID -> [{ to: stationId, weight: distance }]
    }
    
    /**
     * Add a station node to the graph
     */
    addNode(stationId) {
        this.nodes.add(stationId);
        if (!this.edges.has(stationId)) {
            this.edges.set(stationId, []);
        }
    }
    
    /**
     * Add a bidirectional edge between two stations
     */
    addEdge(from, to, weight) {
        this.addNode(from);
        this.addNode(to);
        
        // Add edge from -> to
        this.edges.get(from).push({ to, weight });
        
        // Add edge to -> from (bidirectional)
        this.edges.get(to).push({ to: from, weight });
    }
    
    /**
     * Remove all edges connected to a station
     */
    removeNode(stationId) {
        this.nodes.delete(stationId);
        this.edges.delete(stationId);
        
        // Remove edges pointing to this station
        for (const [nodeId, edges] of this.edges) {
            this.edges.set(nodeId, edges.filter(edge => edge.to !== stationId));
        }
    }
    
    /**
     * Get all neighbors of a station
     */
    getNeighbors(stationId) {
        return this.edges.get(stationId) || [];
    }
    
    /**
     * Check if there's a direct connection between two stations
     */
    hasEdge(from, to) {
        const neighbors = this.getNeighbors(from);
        return neighbors.some(edge => edge.to === to);
    }
}

/**
 * Priority queue implementation for Dijkstra's algorithm
 */
class PriorityQueue {
    constructor() {
        this.items = [];
    }
    
    enqueue(item, priority) {
        this.items.push({ item, priority });
        this.items.sort((a, b) => a.priority - b.priority);
    }
    
    dequeue() {
        return this.items.shift();
    }
    
    isEmpty() {
        return this.items.length === 0;
    }
}

/**
 * Dijkstra's algorithm implementation
 * Returns shortest path from start to end station
 */
export function dijkstra(graph, start, end) {
    if (start === end) {
        return { path: [start], distance: 0 };
    }
    
    const distances = new Map();
    const previous = new Map();
    const visited = new Set();
    const queue = new PriorityQueue();
    
    // Initialize distances
    for (const node of graph.nodes) {
        distances.set(node, node === start ? 0 : Infinity);
        previous.set(node, null);
    }
    
    queue.enqueue(start, 0);
    
    while (!queue.isEmpty()) {
        const { item: current } = queue.dequeue();
        
        if (visited.has(current)) continue;
        visited.add(current);
        
        if (current === end) {
            // Reconstruct path
            const path = [];
            let currentNode = end;
            while (currentNode !== null) {
                path.unshift(currentNode);
                currentNode = previous.get(currentNode);
            }
            return { path, distance: distances.get(end) };
        }
        
        const neighbors = graph.getNeighbors(current);
        for (const { to: neighbor, weight } of neighbors) {
            if (visited.has(neighbor)) continue;
            
            const newDistance = distances.get(current) + weight;
            if (newDistance < distances.get(neighbor)) {
                distances.set(neighbor, newDistance);
                previous.set(neighbor, current);
                queue.enqueue(neighbor, newDistance);
            }
        }
    }
    
    // No path found
    return { path: [], distance: Infinity };
}

/**
 * Build a routing table for all pairs of stations
 * Returns a Map where key is "fromId-toId" and value is the path array
 */
export function buildRoutingTable(graph) {
    const routingTable = new Map();
    
    for (const start of graph.nodes) {
        for (const end of graph.nodes) {
            if (start !== end) {
                const { path } = dijkstra(graph, start, end);
                if (path.length > 0) {
                    routingTable.set(`${start}-${end}`, path);
                }
            }
        }
    }
    
    return routingTable;
}

/**
 * Find the next hop station from current to destination
 */
export function getNextHop(routingTable, from, to) {
    const key = `${from}-${to}`;
    const path = routingTable.get(key);
    
    if (!path || path.length < 2) {
        return null;
    }
    
    return path[1]; // Next station in the path
}

/**
 * Check if there's a valid path between two stations
 */
export function hasPath(routingTable, from, to) {
    const key = `${from}-${to}`;
    return routingTable.has(key) && routingTable.get(key).length > 0;
}

/**
 * Get the full path between two stations
 */
export function getPath(routingTable, from, to) {
    const key = `${from}-${to}`;
    return routingTable.get(key) || [];
}

/**
 * Calculate the total distance of a path through multiple stations
 */
export function calculatePathDistance(path, stations) {
    if (path.length < 2) return 0;
    
    let totalDistance = 0;
    for (let i = 0; i < path.length - 1; i++) {
        const from = stations.find(s => s.id === path[i]);
        const to = stations.find(s => s.id === path[i + 1]);
        
        if (from && to) {
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            totalDistance += Math.sqrt(dx * dx + dy * dy);
        }
    }
    
    return totalDistance;
} 