// Data Models
class User {
    constructor(id, fullName, email, major, profileImage = null, connections = []) {
        this.id = id;
        this.fullName = fullName;
        this.email = email;
        this.major = major;
        this.profileImage = profileImage;
        this.connections = connections;
    }
}

class StudySpace {
    constructor(id = crypto.randomUUID(), building, name, location, hours, restrictions, crowdStatus = 'Unknown') {
        this.id = id;
        this.building = building;
        this.name = name;
        this.location = location;
        this.hours = hours;
        this.restrictions = restrictions;
        this.crowdStatus = crowdStatus;
        this.lastUpdated = null;
        this.updatedBy = null;
    }
}

class CampusBuilding {
    constructor(name, code, description, coordinates, services, imageNames = []) {
        this.id = crypto.randomUUID();
        this.name = name;
        this.code = code;
        this.description = description;
        this.coordinates = coordinates;
        this.services = services;
        this.imageNames = imageNames;
    }
}

// Firebase Service
class FirebaseService {
    constructor() {
        this.database = window.firebaseDatabase;
        this.auth = window.firebaseAuth;
        this.ref = window.firebaseRef;
        this.onValue = window.firebaseOnValue;
        this.set = window.firebaseSet;
        this.push = window.firebasePush;
        this.serverTimestamp = window.firebaseServerTimestamp;
        this.signInAnonymously = window.firebaseSignInAnonymously;
        this.onAuthStateChanged = window.firebaseOnAuthStateChanged;
        
        this.currentUser = null;
        this.listeners = new Map();
    }

    async initialize() {
        try {
            // Sign in anonymously
            await this.signInAnonymously(this.auth);
            
            // Listen for auth state changes
            this.onAuthStateChanged(this.auth, (user) => {
                this.currentUser = user;
                console.log('Firebase auth state changed:', user ? 'Authenticated' : 'Not authenticated');
            });

            return true;
        } catch (error) {
            console.error('Firebase initialization failed:', error);
            return false;
        }
    }

    // Study Spaces
    async getStudySpaces() {
        const studySpacesRef = this.ref(this.database, 'studySpaces');
        return new Promise((resolve) => {
            this.onValue(studySpacesRef, (snapshot) => {
                const data = snapshot.val();
                if (data) {
                    const spaces = Object.keys(data).map(key => ({
                        id: key,
                        ...data[key]
                    }));
                    resolve(spaces);
                } else {
                    resolve([]);
                }
            });
        });
    }

    async updateStudySpaceStatus(spaceId, status) {
        if (!this.currentUser) {
            console.error('User not authenticated');
            return false;
        }

        // Find the current study space object to preserve all fields
        const allSpaces = window.app?.state?.studySpaces || [];
        const currentSpace = allSpaces.find(s => s.id === spaceId);
        if (!currentSpace) {
            console.error('Study space not found for update');
            return false;
        }

        try {
            const spaceRef = this.ref(this.database, `studySpaces/${spaceId}`);
            await this.set(spaceRef, {
                building: currentSpace.building,
                name: currentSpace.name,
                location: currentSpace.location,
                hours: currentSpace.hours,
                restrictions: currentSpace.restrictions,
                crowdStatus: status,
                lastUpdated: this.serverTimestamp(),
                updatedBy: this.currentUser.uid
            });
            return true;
        } catch (error) {
            console.error('Failed to update study space status:', error);
            return false;
        }
    }

    // Listen for real-time updates
    listenToStudySpaces(callback) {
        const studySpacesRef = this.ref(this.database, 'studySpaces');
        
        const unsubscribe = this.onValue(studySpacesRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const spaces = Object.keys(data).map(key => ({
                    id: key,
                    ...data[key]
                }));
                callback(spaces);
            } else {
                callback([]);
            }
        });

        this.listeners.set('studySpaces', unsubscribe);
        return unsubscribe;
    }

    // Initialize default study spaces if they don't exist
    async initializeStudySpaces(defaultSpaces) {
        const studySpacesRef = this.ref(this.database, 'studySpaces');
        
        try {
            const snapshot = await this.onValue(studySpacesRef, (snapshot) => {
                const data = snapshot.val();
                if (!data || Object.keys(data).length === 0) {
                    // Initialize with default data
                    defaultSpaces.forEach(space => {
                        this.set(this.ref(this.database, `studySpaces/${space.id}`), {
                            building: space.building,
                            name: space.name,
                            location: space.location,
                            hours: space.hours,
                            restrictions: space.restrictions,
                            crowdStatus: space.crowdStatus,
                            lastUpdated: this.serverTimestamp(),
                            updatedBy: 'system'
                        });
                    });
                }
            });
        } catch (error) {
            console.error('Failed to initialize study spaces:', error);
        }
    }

    // Cleanup listeners
    cleanup() {
        this.listeners.forEach(unsubscribe => unsubscribe());
        this.listeners.clear();
    }
}

// App State
class AppState {
    constructor() {
        this.currentUser = null;
        this.isLoggedIn = false;
        this.studySpaces = [];
        this.buildings = [];
        this.selectedBuilding = null;
        this.selectedStudySpace = null;
        this.map = null;
        this.markers = [];
        this.currentRoute = null;
        this.searchText = '';
        this.mapType = 'standard';
        this.firebaseService = new FirebaseService();
        this.isConnected = false;
    }

    async init() {
        // Initialize Firebase first
        this.isConnected = await this.firebaseService.initialize();
        this.updateConnectionStatus();
        
        this.loadBuildings();
        this.loadSavedData();
        
        // Initialize study spaces with Firebase
        await this.initializeStudySpaces();
        
        // Start listening for real-time updates
        this.startRealtimeUpdates();
    }

    async initializeStudySpaces() {
        const defaultSpaces = [
            {
                id: 'bricker-1',
                building: 'Bricker Academic Building',
                name: 'Second and Third Floor',
                location: 'Second and Third Floor',
                hours: '7:00 AM - 11:00 PM',
                restrictions: 'None',
                crowdStatus: 'Unknown'
            },
            {
                id: 'fncc-1',
                building: 'Fred Nichols Campus Centre',
                name: '24-Hour Lounge',
                location: 'Second Floor',
                hours: 'Always Open',
                restrictions: 'None',
                crowdStatus: 'Unknown'
            },
            {
                id: 'fncc-2',
                building: 'Fred Nichols Campus Centre',
                name: 'Concourse',
                location: 'First Floor',
                hours: 'Always Open',
                restrictions: 'None; OneCard required to access from 11 p.m. – 7 a.m.',
                crowdStatus: 'Unknown'
            },
            {
                id: 'fncc-3',
                building: 'Fred Nichols Campus Centre',
                name: 'Solarium',
                location: 'First Floor',
                hours: 'Always Open',
                restrictions: 'None; OneCard required to access from 11 p.m. – 7 a.m.',
                crowdStatus: 'Unknown'
            },
            {
                id: 'lazaridis-1',
                building: 'Lazaridis Hall',
                name: 'Lazaridis Hall',
                location: 'All Floors',
                hours: '7:00 AM - Midnight',
                restrictions: 'None; OneCard required from 11 p.m. – midnight',
                crowdStatus: 'Unknown'
            },
            {
                id: 'library-1',
                building: 'Library',
                name: 'Library Inside',
                location: 'All Floors',
                hours: 'Weekdays 8:30 AM - 10:00 PM; Saturdays and Sundays 11:00 AM - 5:00 PM',
                restrictions: 'None; seventh floor is a quiet study zone',
                crowdStatus: 'Unknown'
            }
        ];

        await this.firebaseService.initializeStudySpaces(defaultSpaces);
    }

    startRealtimeUpdates() {
        this.firebaseService.listenToStudySpaces((spaces) => {
            this.studySpaces = spaces;
            this.renderStudySpaces();
        });
    }

    updateConnectionStatus() {
        const indicator = document.getElementById('connection-indicator');
        const text = document.getElementById('connection-text');
        
        if (this.isConnected) {
            indicator.className = 'connection-dot connected';
            text.textContent = 'Connected';
        } else {
            indicator.className = 'connection-dot disconnected';
            text.textContent = 'Disconnected';
        }
    }

    loadBuildings() {
        this.buildings = [
            new CampusBuilding(
                'Lazaridis Hall',
                'LH',
                'Home to the Lazaridis School of Business & Economics and Department of Mathematics',
                [43.47511, -80.5295],
                ['Business School', 'Mathematics Department', 'Starbucks', 'Study Rooms', 'Computer Labs']
            ),
            new CampusBuilding(
                'Fred Nichols Campus Centre',
                'FNCC',
                'Student union building with food court and student services',
                [43.473366604806664, -80.52876895007834],
                ['Food Court', 'Wilf\'s Pub', 'Student Services', 'Bookstore', 'OneCard Office']
            ),
            new CampusBuilding(
                'Schlegel Building',
                'SBE',
                'Part of the School of Business & Economics',
                [43.47325, -80.53027],
                ['Classrooms', 'Faculty Offices', 'Study Areas']
            ),
            new CampusBuilding(
                'Little House Residence',
                'LH',
                'Traditional-style residence building',
                [43.47332, -80.52774],
                ['Student Housing', 'Common Rooms', 'Laundry Facilities']
            ),
            new CampusBuilding(
                'Leopold Residence',
                'LP',
                'Modern residence building',
                [43.47264, -80.52822],
                ['Student Housing', 'Study Rooms', 'Laundry Facilities']
            ),
            new CampusBuilding(
                'Bricker Residence',
                'BR',
                'Apartment-style residence building',
                [43.47245, -80.52743],
                ['Student Housing', 'Kitchen Facilities', 'Laundry Facilities']
            ),
            new CampusBuilding(
                'Bouckaert Residence',
                'BC',
                'Traditional-style residence building',
                [43.47288, -80.52714],
                ['Student Housing', 'Common Areas', 'Laundry Facilities']
            ),
            new CampusBuilding(
                '53 Bricker Avenue',
                '53B',
                'Student residence building',
                [43.47137, -80.52788],
                ['Student Housing', 'Study Areas', 'Laundry Facilities']
            ),
            new CampusBuilding(
                'Willison Residence',
                'WH',
                'Traditional-style residence building',
                [43.47367, -80.52672],
                ['Student Housing', 'Common Rooms', 'Laundry Facilities']
            ),
            new CampusBuilding(
                'Alumni Field',
                'AF',
                'Outdoor athletic field with artificial turf',
                [43.47415, -80.52552],
                ['Sports Field', 'Outdoor Events', 'Recreation Area']
            ),
            new CampusBuilding(
                'Athletic Complex',
                'AC',
                'Main athletic and recreation facility',
                [43.47522, -80.52571],
                ['Gymnasium', 'Fitness Center', 'Pool', 'Change Rooms', 'Athletic Services']
            ),
            new CampusBuilding(
                'Parking Lot 4',
                'P4',
                'Main campus parking lot',
                [43.47384, -80.52707],
                ['Student Parking', 'Faculty Parking', 'Visitor Parking']
            ),
            new CampusBuilding(
                'Parking Lot 20',
                'P20',
                'Athletic Complex parking lot',
                [43.47426, -80.52721],
                ['Student Parking', 'Event Parking', 'Visitor Parking']
            ),
            new CampusBuilding(
                'Arts Building',
                'AB',
                'Home to arts and humanities departments',
                [43.4738, -80.5292],
                ['Classrooms', 'Performance Spaces', 'Faculty Offices']
            )
        ];
    }

    loadSavedData() {
        // Load any saved user preferences or data
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            this.currentUser = JSON.parse(savedUser);
            this.isLoggedIn = true;
        }
    }

    async updateCrowdStatus(spaceId, newStatus) {
        const success = await this.firebaseService.updateStudySpaceStatus(spaceId, newStatus);
        if (success) {
            console.log(`Updated ${spaceId} status to ${newStatus}`);
        } else {
            console.error('Failed to update crowd status');
        }
        return success;
    }

    getFilteredBuildings() {
        if (!this.searchText) return this.buildings;
        return this.buildings.filter(building => 
            building.name.toLowerCase().includes(this.searchText.toLowerCase()) ||
            building.code.toLowerCase().includes(this.searchText.toLowerCase())
        );
    }

    formatTimestamp(timestamp) {
        if (!timestamp) return 'Never';
        
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        
        return date.toLocaleDateString();
    }
}

// Main App Controller
class LaurierConnectApp {
    constructor() {
        this.state = new AppState();
        this.init();
    }

    async init() {
        await this.state.init();
        this.setupEventListeners();
        this.renderWelcomeScreen();
    }

    setupEventListeners() {
        // Welcome screen
        document.getElementById('get-started-btn').addEventListener('click', () => {
            this.showMainApp();
        });

        // Sidebar toggle for mobile
        const sidebarToggle = document.getElementById('sidebar-toggle');
        const mapSidebar = document.getElementById('map-sidebar');
        function handleSidebarToggle() {
            mapSidebar.classList.toggle('open');
        }
        sidebarToggle.addEventListener('click', handleSidebarToggle);
        // Show/hide toggle button based on screen size
        function updateSidebarToggleVisibility() {
            if (window.innerWidth <= 768) {
                sidebarToggle.style.display = 'flex';
                mapSidebar.classList.remove('open');
            } else {
                sidebarToggle.style.display = 'none';
                mapSidebar.classList.remove('open');
            }
        }
        window.addEventListener('resize', updateSidebarToggleVisibility);
        updateSidebarToggleVisibility();

        // Navigation tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.closest('.nav-tab').dataset.tab);
            });
        });

        // Building search
        const searchInput = document.getElementById('building-search');
        searchInput.addEventListener('input', (e) => {
            this.state.searchText = e.target.value;
            this.renderBuildingsList();
            this.updateSearchClearButton();
        });

        // Clear search
        document.getElementById('clear-search').addEventListener('click', () => {
            this.state.searchText = '';
            searchInput.value = '';
            this.renderBuildingsList();
            this.updateSearchClearButton();
        });

        // Map type selector
        document.querySelectorAll('.map-type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.changeMapType(e.target.dataset.type);
            });
        });

        // Refresh study spaces
        document.getElementById('refresh-study').addEventListener('click', () => {
            this.refreshStudySpaces();
        });

        // Modal close buttons
        document.getElementById('close-building-modal').addEventListener('click', () => {
            this.closeBuildingModal();
        });

        document.getElementById('close-study-modal').addEventListener('click', () => {
            this.closeStudyModal();
        });

        // Study space status buttons
        document.addEventListener('click', (e) => {
            if (e.target.closest('.status-btn')) {
                const btn = e.target.closest('.status-btn');
                const status = btn.dataset.status;
                this.updateStudySpaceStatus(status);
            }
        });

        // Get directions button
        document.getElementById('get-directions-btn').addEventListener('click', () => {
            this.showDirections();
        });
    }

    renderWelcomeScreen() {
        document.getElementById('welcome-screen').classList.remove('hidden');
        document.getElementById('main-app').classList.add('hidden');
    }

    showMainApp() {
        document.getElementById('welcome-screen').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        this.initMap();
        this.renderBuildingsList();
        this.renderStudySpaces();
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // Resize map if switching to map tab
        if (tabName === 'map' && this.state.map) {
            setTimeout(() => {
                this.state.map.invalidateSize();
            }, 100);
        }
    }

    initMap() {
        // Initialize Leaflet map
        this.state.map = L.map('map').setView([43.4735, -80.5273], 16);
        
        // Add tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.state.map);

        // Add building markers
        this.state.buildings.forEach(building => {
            const marker = L.marker(building.coordinates)
                .bindPopup(`
                    <div style="text-align: center;">
                        <h3 style="margin: 0 0 8px 0; color: #8b5cf6;">${building.name}</h3>
                        <p style="margin: 0 0 8px 0; font-size: 14px;">${building.code}</p>
                        <button onclick="app.showBuildingModal('${building.id}')" 
                                style="background: #8b5cf6; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer;">
                            View Details
                        </button>
                    </div>
                `)
                .addTo(this.state.map);
            
            this.state.markers.push(marker);
        });
    }

    changeMapType(type) {
        this.state.mapType = type;
        
        // Update button states
        document.querySelectorAll('.map-type-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-type="${type}"]`).classList.add('active');

        // Update map tiles
        this.state.map.removeLayer(this.state.map._tileLayer);
        
        let tileUrl;
        switch (type) {
            case 'satellite':
                tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
                break;
            case 'hybrid':
                tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
                break;
            default:
                tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        }

        L.tileLayer(tileUrl, {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.state.map);
    }

    renderBuildingsList() {
        const buildingsList = document.getElementById('buildings-list');
        const filteredBuildings = this.state.getFilteredBuildings();
        
        buildingsList.innerHTML = filteredBuildings.map(building => `
            <div class="building-item ${this.state.selectedBuilding?.id === building.id ? 'selected' : ''}" 
                 onclick="app.selectBuilding('${building.id}')">
                <h4>${building.name}</h4>
                <div class="code">${building.code}</div>
            </div>
        `).join('');
    }

    selectBuilding(buildingId) {
        const building = this.state.buildings.find(b => b.id === buildingId);
        if (building) {
            this.state.selectedBuilding = building;
            this.renderBuildingsList();
            this.state.map.setView(building.coordinates, 18);
            this.showBuildingModal(buildingId);
        }
    }

    showBuildingModal(buildingId) {
        const building = this.state.buildings.find(b => b.id === buildingId);
        if (!building) return;

        document.getElementById('building-name').textContent = building.name;
        document.getElementById('building-code').textContent = building.code;
        document.getElementById('building-description').textContent = building.description;
        
        const servicesList = document.getElementById('building-services');
        servicesList.innerHTML = building.services.map(service => 
            `<span class="service-tag">${service}</span>`
        ).join('');

        document.getElementById('building-modal').classList.remove('hidden');
    }

    closeBuildingModal() {
        document.getElementById('building-modal').classList.add('hidden');
    }

    showDirections() {
        if (!this.state.selectedBuilding) return;
        
        // For demo purposes, we'll just show an alert
        // In a real app, you'd integrate with a routing service
        alert(`Directions to ${this.state.selectedBuilding.name} would be displayed here.`);
        this.closeBuildingModal();
    }

    renderStudySpaces() {
        const studySpacesList = document.getElementById('study-spaces-list');
        
        studySpacesList.innerHTML = this.state.studySpaces.map(space => `
            <div class="study-space-item" onclick="app.showStudyModal('${space.id}')">
                <div class="study-space-header">
                    <div class="study-space-info">
                        <h3>${space.name}</h3>
                        <div class="building">${space.building}</div>
                    </div>
                    <div class="status-display">
                        <div class="status-indicator ${this.getStatusClass(space.crowdStatus)}"></div>
                        <span>${space.crowdStatus}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    getStatusClass(status) {
        switch (status) {
            case 'Empty': return 'empty';
            case 'Not Crowded': return 'not-crowded';
            case 'Very Busy': return 'very-busy';
            default: return 'unknown';
        }
    }

    showStudyModal(spaceId) {
        const space = this.state.studySpaces.find(s => s.id === spaceId);
        if (!space) return;

        this.state.selectedStudySpace = space;

        document.getElementById('study-name').textContent = space.name;
        document.getElementById('study-building').textContent = space.building;
        document.getElementById('study-location').textContent = space.location;
        document.getElementById('study-hours').textContent = space.hours;
        document.getElementById('study-restrictions').textContent = space.restrictions;

        // Update current status display
        const currentIndicator = document.getElementById('current-status-indicator');
        const currentText = document.getElementById('current-status-text');
        
        currentIndicator.className = `status-indicator ${this.getStatusClass(space.crowdStatus)}`;
        currentText.textContent = space.crowdStatus;

        // Update last updated time
        const lastUpdatedTime = document.getElementById('last-updated-time');
        lastUpdatedTime.textContent = this.state.formatTimestamp(space.lastUpdated);

        // Update status button selection
        document.querySelectorAll('.status-btn').forEach(btn => {
            btn.classList.remove('selected');
        });

        document.getElementById('study-modal').classList.remove('hidden');
    }

    closeStudyModal() {
        document.getElementById('study-modal').classList.add('hidden');
        this.state.selectedStudySpace = null;
    }

    async updateStudySpaceStatus(status) {
        if (!this.state.selectedStudySpace) return;

        // Update button selection
        document.querySelectorAll('.status-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        event.target.closest('.status-btn').classList.add('selected');

        // Update the study space via Firebase
        const statusText = status === 'empty' ? 'Empty' : 
                          status === 'notCrowded' ? 'Not Crowded' : 
                          status === 'veryBusy' ? 'Very Busy' : 'Unknown';

        const success = await this.state.updateCrowdStatus(this.state.selectedStudySpace.id, statusText);
        
        if (success) {
            // Re-fetch the latest study space object from state
            const updatedSpace = this.state.studySpaces.find(s => s.id === this.state.selectedStudySpace.id);
            if (updatedSpace) {
                this.state.selectedStudySpace = updatedSpace;
                document.getElementById('study-name').textContent = updatedSpace.name;
                document.getElementById('study-building').textContent = updatedSpace.building;
                document.getElementById('study-location').textContent = updatedSpace.location;
                document.getElementById('study-hours').textContent = updatedSpace.hours;
                document.getElementById('study-restrictions').textContent = updatedSpace.restrictions;
            }
            // Update current status display
            const currentIndicator = document.getElementById('current-status-indicator');
            const currentText = document.getElementById('current-status-text');
            currentIndicator.className = `status-indicator ${this.getStatusClass(statusText)}`;
            currentText.textContent = statusText;
            // Update last updated time
            const lastUpdatedTime = document.getElementById('last-updated-time');
            lastUpdatedTime.textContent = 'Just now';
        } else {
            alert('Failed to update status. Please try again.');
        }
    }

    refreshStudySpaces() {
        // Show a brief loading state
        const refreshBtn = document.getElementById('refresh-study');
        const originalText = refreshBtn.innerHTML;
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
        
        setTimeout(() => {
            refreshBtn.innerHTML = originalText;
        }, 1000);
    }

    updateSearchClearButton() {
        const clearBtn = document.getElementById('clear-search');
        if (this.state.searchText) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
    }
}

// Initialize the app when the page loads
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new LaurierConnectApp();
}); 
