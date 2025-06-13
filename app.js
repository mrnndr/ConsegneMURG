class PatientManager {
    constructor() {
        this.patients = [];
        this.currentPatient = null;
        this.computerId = this.generateComputerId();
        this.isGoogleSignedIn = false;
        this.autoSyncEnabled = true;
        this.syncInterval = null;
        
        this.init();
    }

    generateComputerId() {
        let id = localStorage.getItem('computerId');
        if (!id) {
            id = 'PC_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('computerId', id);
        }
        return id;
    }

    init() {
        this.loadLocalData();
        this.setupEventListeners();
        this.renderPatients();
        this.updateLastUpdateTime();
        this.initGoogleAPI();
        this.startAutoSync();
    }

    setupEventListeners() {
        // Pulsanti principali
        document.getElementById('refreshBtn').addEventListener('click', () => this.refreshData());
        document.getElementById('addPatientBtn').addEventListener('click', () => this.openModal());
        
        // Google Drive
        document.getElementById('googleSignInBtn').addEventListener('click', () => this.signInGoogle());
        document.getElementById('googleSignOutBtn').addEventListener('click', () => this.signOutGoogle());
        document.getElementById('autoSyncToggle').addEventListener('change', (e) => this.toggleAutoSync(e.target.checked));
        
        // Modal
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
        
        // Form
        document.getElementById('patientForm').addEventListener('submit', (e) => this.savePatient(e));
        
        // Filtri
        document.getElementById('sortBy').addEventListener('change', () => this.renderPatients());
        document.getElementById('filterPriority').addEventListener('change', () => this.renderPatients());
        document.getElementById('searchInput').addEventListener('input', () => this.renderPatients());
        
        // Chiusura modal cliccando fuori
        window.addEventListener('click', (e) => {
            const modal = document.getElementById('patientModal');
            if (e.target === modal) this.closeModal();
        });
    }

    loadLocalData() {
        try {
            const data = localStorage.getItem('patientsData');
            if (data) {
                const parsedData = JSON.parse(data);
                this.patients = parsedData.patients || [];
                console.log('Dati caricati dal localStorage:', this.patients.length, 'pazienti');
            }
        } catch (error) {
            console.error('Errore nel caricamento dei dati locali:', error);
            this.patients = [];
        }
    }

    saveLocalData() {
        try {
            const dataToSave = {
                patients: this.patients,
                lastUpdated: new Date().toISOString(),
                computerId: this.computerId
            };
            localStorage.setItem('patientsData', JSON.stringify(dataToSave));
            console.log('Dati salvati nel localStorage');
        } catch (error) {
            console.error('Errore nel salvataggio dei dati locali:', error);
        }
    }

    saveData() {
        this.saveLocalData();
        if (this.isGoogleSignedIn && this.autoSyncEnabled) {
            this.syncToGoogleDrive();
        }
    }

    refreshData() {
        if (this.isGoogleSignedIn) {
            this.loadFromGoogleDrive();
        } else {
            this.loadLocalData();
            this.renderPatients();
        }
        this.updateLastUpdateTime();
    }

    openModal(patient = null) {
        this.currentPatient = patient;
        const modal = document.getElementById('patientModal');
        const form = document.getElementById('patientForm');
        
        if (patient) {
            // Modifica paziente esistente
            document.getElementById('patientName').value = patient.name || '';
            document.getElementById('patientAge').value = patient.age || '';
            document.getElementById('patientRoom').value = patient.room || '';
            document.getElementById('patientPriority').value = patient.priority || 'gestione';
            document.getElementById('recentHistory').value = patient.recentHistory || '';
            document.getElementById('pastHistory').value = patient.pastHistory || '';
            document.getElementById('management').value = patient.management || '';
            document.getElementById('notes').value = patient.notes || '';
        } else {
            // Nuovo paziente
            form.reset();
            document.getElementById('patientPriority').value = 'gestione';
        }
        
        modal.style.display = 'block';
    }

    closeModal() {
        document.getElementById('patientModal').style.display = 'none';
        this.currentPatient = null;
    }

    savePatient(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const patientData = {
            id: this.currentPatient ? this.currentPatient.id : this.generateId(),
            name: formData.get('name') || '',
            age: parseInt(formData.get('age')) || 0,
            room: formData.get('room') || '',
            priority: formData.get('priority') || 'gestione',
            recentHistory: formData.get('recentHistory') || '',
            pastHistory: formData.get('pastHistory') || '',
            management: formData.get('management') || '',
            notes: formData.get('notes') || '',
            lastUpdated: new Date().toISOString(),
            computerId: this.computerId
        };

        console.log('Salvando paziente:', patientData);

        if (this.currentPatient) {
            // Modifica paziente esistente
            const index = this.patients.findIndex(p => p.id === this.currentPatient.id);
            if (index !== -1) {
                this.patients[index] = patientData;
            }
        } else {
            // Nuovo paziente
            this.patients.push(patientData);
        }

        this.saveData();
        this.renderPatients();
        this.closeModal();
        this.updateLastUpdateTime();
    }

    deletePatient(patientId) {
        if (confirm('Sei sicuro di voler eliminare questo paziente?')) {
            this.patients = this.patients.filter(p => p.id !== patientId);
            this.saveData();
            this.renderPatients();
            this.updateLastUpdateTime();
        }
    }

    generateId() {
        return Date.now().toString() + Math.random().toString(36).substr(2, 5);
    }

    renderPatients() {
        const container = document.getElementById('patientsContainer');
        const sortBy = document.getElementById('sortBy').value;
        const filterPriority = document.getElementById('filterPriority').value;
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();

        // Filtra pazienti
        let filteredPatients = this.patients.filter(patient => {
            const matchesSearch = !searchTerm || 
                patient.name.toLowerCase().includes(searchTerm) ||
                patient.room.toLowerCase().includes(searchTerm);
            const matchesPriority = filterPriority === 'all' || patient.priority === filterPriority;
            return matchesSearch && matchesPriority;
        });

        // Ordina pazienti
        filteredPatients.sort((a, b) => {
            if (sortBy === 'room') {
                const roomA = a.room || '';
                const roomB = b.room || '';
                return roomA.localeCompare(roomB);
            } else if (sortBy === 'priority') {
                const priorityOrder = { 'alert': 1, 'dimissione': 2, 'trasferimento': 3, 'gestione': 4 };
                const priorityA = priorityOrder[a.priority] || 999;
                const priorityB = priorityOrder[b.priority] || 999;
                return priorityA - priorityB;
            }
            return 0;
        });

        // Renderizza pazienti
        container.innerHTML = '';
        filteredPatients.forEach(patient => {
            const patientCard = this.createPatientCard(patient);
            container.appendChild(patientCard);
        });

        // Aggiorna contatore
        document.getElementById('patientCount').textContent = `Pazienti: ${filteredPatients.length}`;
    }

    createPatientCard(patient) {
        const card = document.createElement('div');
        card.className = `patient-card priority-${patient.priority}`;
        
        // Formatta la data di inserimento
        const insertDate = new Date(patient.lastUpdated);
        const formattedDate = insertDate.toLocaleDateString('it-IT') + ' ' + insertDate.toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'});
        
        card.innerHTML = `
            <div class="patient-header">
                <h3>${patient.name}</h3>
                <div class="patient-details">
                    <span class="age">Età: ${patient.age}</span>
                    <span class="room">Letto: ${patient.room}</span>
                    <span class="admission-date">Ricovero: ${formattedDate}</span>
                </div>
            </div>
            <div class="patient-info">
                <div class="info-section">
                    <h4>📋 Anamnesi Recente</h4>
                    <p>${patient.recentHistory || 'Non specificata'}</p>
                </div>
                <div class="info-section">
                    <h4>📋 Anamnesi Remota</h4>
                    <p>${patient.pastHistory || 'Non specificata'}</p>
                </div>
                <div class="info-section">
                    <h4>💊 Gestione e Programma</h4>
                    <p>${patient.management || 'Non specificato'}</p>
                </div>
                <div class="info-section">
                    <h4>📝 Note Consegna</h4>
                    <p>${patient.notes || 'Nessuna nota'}</p>
                </div>
                <p><strong>Priorità:</strong> <span class="priority-badge priority-${patient.priority}">${patient.priority}</span></p>
            </div>
            <div class="patient-actions">
                <button onclick="patientManager.openModal(${JSON.stringify(patient).replace(/"/g, '&quot;')})" class="btn btn-edit">✏️ Modifica</button>
                <button onclick="patientManager.deletePatient('${patient.id}')" class="btn btn-delete">🗑️ Elimina</button>
            </div>
        `;
        return card;
    }

    updateLastUpdateTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('it-IT', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        document.getElementById('lastUpdate').textContent = `Ultimo aggiornamento: ${timeString}`;
    }

    // Google Drive Integration
    async initGoogleAPI() {
        try {
            await new Promise((resolve) => {
                gapi.load('auth2:client', resolve);
            });
            
            await gapi.client.init({
                apiKey: 'AIzaSyB9PjKTZzsJLQAX8FWSUl0uFr8EA7L9d1Q',
                clientId: '23098578039-fqcmp2bh03v5t4ufqlnhon6255s88h57.apps.googleusercontent.com',
                discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
                scope: 'https://www.googleapis.com/auth/drive' // ← Cambiato da 'drive.file' a 'drive'
            });
            
            const authInstance = gapi.auth2.getAuthInstance();
            this.isGoogleSignedIn = authInstance.isSignedIn.get();
            this.updateGoogleStatus();
            
        } catch (error) {
            console.error('Errore nell\'inizializzazione di Google API:', error);
        }
    }

    async signInGoogle() {
        try {
            const authInstance = gapi.auth2.getAuthInstance();
            await authInstance.signIn();
            this.isGoogleSignedIn = true;
            this.updateGoogleStatus();
            this.loadFromGoogleDrive();
        } catch (error) {
            console.error('Errore nel login Google:', error);
        }
    }

    async signOutGoogle() {
        try {
            const authInstance = gapi.auth2.getAuthInstance();
            await authInstance.signOut();
            this.isGoogleSignedIn = false;
            this.updateGoogleStatus();
        } catch (error) {
            console.error('Errore nel logout Google:', error);
        }
    }

    updateGoogleStatus() {
        const signInBtn = document.getElementById('googleSignInBtn');
        const signOutBtn = document.getElementById('googleSignOutBtn');
        const status = document.getElementById('googleStatus');
        
        if (this.isGoogleSignedIn) {
            signInBtn.style.display = 'none';
            signOutBtn.style.display = 'inline-flex';
            status.textContent = '✅ Connesso a Google Drive';
            status.className = 'sync-status active';
        } else {
            signInBtn.style.display = 'inline-flex';
            signOutBtn.style.display = 'none';
            status.textContent = '❌ Non connesso a Google Drive';
            status.className = 'sync-status inactive';
        }
    }

    async syncToGoogleDrive() {
        if (!this.isGoogleSignedIn) return;
        
        try {
            console.log('Inizio sincronizzazione con Google Drive...');
            
            // Prima, cerca o crea la cartella "Consegne"
            let folderId = await this.getOrCreateFolder('Consegne');
            
            const dataToSync = {
                patients: this.patients,
                lastUpdated: new Date().toISOString(),
                computerId: this.computerId
            };
            
            const fileContent = JSON.stringify(dataToSync, null, 2);
            
            // Cerca se il file esiste già
            const existingFile = await this.findFileInFolder('consegne_data.json', folderId);
            
            if (existingFile) {
                // Aggiorna il file esistente
                await this.updateFile(existingFile.id, fileContent);
                console.log('File aggiornato su Google Drive');
            } else {
                // Crea un nuovo file
                await this.createFile('consegne_data.json', fileContent, folderId);
                console.log('Nuovo file creato su Google Drive');
            }
            
        } catch (error) {
            console.error('Errore nella sincronizzazione con Google Drive:', error);
            alert('Errore nella sincronizzazione: ' + error.message);
        }
    }

    // Funzione per trovare o creare una cartella
    async getOrCreateFolder(folderName) {
        try {
            // Cerca la cartella esistente
            const response = await gapi.client.drive.files.list({
                q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                fields: 'files(id, name)'
            });
            
            if (response.result.files.length > 0) {
                return response.result.files[0].id;
            }
            
            // Crea la cartella se non esiste
            const folderMetadata = {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder'
            };
            
            const folder = await gapi.client.drive.files.create({
                resource: folderMetadata,
                fields: 'id'
            });
            
            console.log(`Cartella "${folderName}" creata con ID:`, folder.result.id);
            return folder.result.id;
            
        } catch (error) {
            console.error('Errore nella gestione della cartella:', error);
            throw error;
        }
    }

    // Funzione per cercare un file in una cartella specifica
    async findFileInFolder(fileName, folderId) {
        try {
            const response = await gapi.client.drive.files.list({
                q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
                fields: 'files(id, name)'
            });
            
            return response.result.files.length > 0 ? response.result.files[0] : null;
        } catch (error) {
            console.error('Errore nella ricerca del file:', error);
            return null;
        }
    }

    // Funzione per creare un nuovo file
    async createFile(fileName, content, folderId) {
        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const close_delim = "\r\n--" + boundary + "--";
        
        const metadata = {
            name: fileName,
            parents: [folderId]
        };
        
        const multipartRequestBody =
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            content +
            close_delim;
        
        return await gapi.client.request({
            path: 'https://www.googleapis.com/upload/drive/v3/files',
            method: 'POST',
            params: { uploadType: 'multipart' },
            headers: {
                'Content-Type': 'multipart/related; boundary="' + boundary + '"'
            },
            body: multipartRequestBody
        });
    }

    // Funzione per aggiornare un file esistente
    async updateFile(fileId, content) {
        return await gapi.client.request({
            path: `https://www.googleapis.com/upload/drive/v3/files/${fileId}`,
            method: 'PATCH',
            params: { uploadType: 'media' },
            headers: {
                'Content-Type': 'application/json'
            },
            body: content
        });
    }

    async loadFromGoogleDrive() {
        if (!this.isGoogleSignedIn) return;
        
        try {
            console.log('Caricamento dati da Google Drive...');
            
            // Cerca la cartella "Consegne"
            const folderId = await this.getOrCreateFolder('Consegne');
            
            // Cerca il file nella cartella
            const file = await this.findFileInFolder('consegne_data.json', folderId);
            
            if (file) {
                const fileResponse = await gapi.client.drive.files.get({
                    fileId: file.id,
                    alt: 'media'
                });
                
                const data = JSON.parse(fileResponse.body);
                this.patients = data.patients || [];
                this.saveLocalData();
                this.renderPatients();
                console.log('Dati caricati da Google Drive:', this.patients.length, 'pazienti');
            } else {
                console.log('File non trovato su Google Drive');
            }
            
        } catch (error) {
            console.error('Errore nel caricamento da Google Drive:', error);
        }
    }

    toggleAutoSync(enabled) {
        this.autoSyncEnabled = enabled;
        const status = document.getElementById('syncStatus');
        
        if (enabled) {
            status.textContent = '🟢 Auto-sync attivo';
            status.className = 'sync-status active';
            this.startAutoSync();
        } else {
            status.textContent = '⏸️ Auto-sync disattivo';
            status.className = 'sync-status inactive';
            this.stopAutoSync();
        }
    }

    startAutoSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        
        if (this.autoSyncEnabled && this.isGoogleSignedIn) {
            this.syncInterval = setInterval(() => {
                this.syncToGoogleDrive();
            }, 60000); // Sync ogni minuto
        }
    }

    stopAutoSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }
}

// Inizializza l'applicazione
let patientManager;

document.addEventListener('DOMContentLoaded', () => {
    patientManager = new PatientManager();
});

// Funzioni globali per compatibilità
function openModal(patient = null) {
    patientManager.openModal(patient);
}

function closeModal() {
    patientManager.closeModal();
}