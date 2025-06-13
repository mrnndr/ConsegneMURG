class PatientManager {
    constructor() {
        this.patients = [];
        this.currentEditingId = null;
        this.currentMovePatientId = null;
        this.computerId = this.generateComputerId();
        this.googleAPIReady = false;
        this.accessToken = null;
        this.tokenClient = null;
        this.autoSyncInterval = null;
        this.autoSyncEnabled = true;
        this.init();
    }

    generateComputerId() {
        const stored = localStorage.getItem('computerId');
        if (stored) return stored;
        
        const id = 'PC_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('computerId', id);
        return id;
    }

    async init() {
        this.loadLocalData();
        this.setupEventListeners();
        this.renderPatients();
        this.updateLastUpdateTime();
        
        // Inizializza Google API
        await this.initGoogleAPI();
        
        // Avvia auto-sync se abilitato
        if (this.autoSyncEnabled) {
            this.startAutoSync();
        }
    }

    setupEventListeners() {
        // Google Drive buttons
        document.getElementById('googleSignInBtn').addEventListener('click', () => this.signInGoogle());
        document.getElementById('googleSignOutBtn').addEventListener('click', () => this.signOutGoogle());
        
        // Modal controls
        document.getElementById('addPatientBtn').addEventListener('click', () => this.openModal());
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
        document.getElementById('cancelBtn').addEventListener('click', () => this.closeModal());
        
        // Move modal controls
        document.getElementById('closeMoveModal').addEventListener('click', () => this.closeMoveModal());
        document.getElementById('cancelMoveBtn').addEventListener('click', () => this.closeMoveModal());
        
        // Form submissions
        document.getElementById('patientForm').addEventListener('submit', (e) => this.savePatient(e));
        document.getElementById('moveForm').addEventListener('submit', (e) => this.movePatient(e));
        
        // Filters and controls
        document.getElementById('refreshBtn').addEventListener('click', () => this.refreshData());
        document.getElementById('sortBy').addEventListener('change', () => this.renderPatients());
        document.getElementById('filterPriority').addEventListener('change', () => this.renderPatients());
        document.getElementById('searchInput').addEventListener('input', () => this.renderPatients());
        document.getElementById('autoSyncToggle').addEventListener('change', (e) => this.toggleAutoSync(e.target.checked));
        
        // Close modals when clicking outside
        window.addEventListener('click', (e) => {
            const patientModal = document.getElementById('patientModal');
            const moveModal = document.getElementById('moveModal');
            if (e.target === patientModal) this.closeModal();
            if (e.target === moveModal) this.closeMoveModal();
        });
    }

    loadLocalData() {
        const stored = localStorage.getItem('patients_' + this.computerId);
        if (stored) {
            this.patients = JSON.parse(stored);
        }
    }

    saveLocalData() {
        localStorage.setItem('patients_' + this.computerId, JSON.stringify(this.patients));
    }

    async saveData() {
        this.saveLocalData();
        if (this.googleAPIReady && this.accessToken) {
            try {
                await this.syncToGoogleDrive();
            } catch (error) {
                console.error('Errore sincronizzazione Google Drive:', error);
            }
        }
    }

    async refreshData() {
        if (this.googleAPIReady && this.accessToken) {
            try {
                await this.loadFromGoogleDrive();
                this.renderPatients();
                this.updateLastUpdateTime();
                console.log('Dati aggiornati da Google Drive');
            } catch (error) {
                console.error('Errore nel caricamento da Google Drive:', error);
                alert('Errore nel caricamento da Google Drive');
            }
        } else {
            this.renderPatients();
            this.updateLastUpdateTime();
        }
    }

    openModal(patientId = null) {
        this.currentEditingId = patientId;
        const modal = document.getElementById('patientModal');
        const form = document.getElementById('patientForm');
        
        if (patientId) {
            const patient = this.patients.find(p => p.id === patientId);
            if (patient) {
                document.getElementById('patientName').value = patient.name;
                document.getElementById('patientAge').value = patient.age;
                document.getElementById('patientRoom').value = patient.room;
                document.getElementById('patientPriority').value = patient.priority;
                document.getElementById('recentHistory').value = patient.recentHistory || '';
                document.getElementById('pastHistory').value = patient.pastHistory || '';
                document.getElementById('management').value = patient.management || '';
                document.getElementById('notes').value = patient.notes || '';
            }
        } else {
            form.reset();
        }
        
        modal.style.display = 'block';
    }

    closeModal() {
        document.getElementById('patientModal').style.display = 'none';
        this.currentEditingId = null;
    }

    async savePatient(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const patientData = {
            name: formData.get('name'),
            age: parseInt(formData.get('age')),
            room: formData.get('room'),
            priority: formData.get('priority'),
            recentHistory: formData.get('recentHistory') || '',
            pastHistory: formData.get('pastHistory') || '',
            management: formData.get('management') || '',
            notes: formData.get('notes') || '',
            lastUpdate: new Date().toISOString(),
            computerId: this.computerId
        };
        
        if (this.currentEditingId) {
            const index = this.patients.findIndex(p => p.id === this.currentEditingId);
            if (index !== -1) {
                this.patients[index] = { ...this.patients[index], ...patientData };
            }
        } else {
            patientData.id = this.generateId();
            this.patients.push(patientData);
        }
        
        await this.saveData();
        this.renderPatients();
        this.closeModal();
        this.updateLastUpdateTime();
    }

    async deletePatient(patientId) {
        if (confirm('Sei sicuro di voler eliminare questo paziente?')) {
            this.patients = this.patients.filter(p => p.id !== patientId);
            await this.saveData();
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
        
        let filteredPatients = this.patients.filter(patient => {
            const matchesSearch = patient.name.toLowerCase().includes(searchTerm) || 
                                patient.room.toLowerCase().includes(searchTerm);
            const matchesPriority = filterPriority === 'all' || patient.priority === filterPriority;
            return matchesSearch && matchesPriority;
        });
        
        filteredPatients.sort((a, b) => {
            if (sortBy === 'room') {
                return a.room.localeCompare(b.room);
            } else if (sortBy === 'priority') {
                const priorityOrder = { 'alert': 0, 'gestione': 1, 'dimissione': 2, 'trasferimento': 3 };
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            }
            return 0;
        });
        
        container.innerHTML = filteredPatients.map(patient => this.createPatientCard(patient)).join('');
        document.getElementById('patientCount').textContent = `Pazienti: ${filteredPatients.length}`;
    }

    createPatientCard(patient) {
        const priorityEmoji = {
            'alert': '🚨',
            'gestione': '🔄',
            'dimissione': '🏠',
            'trasferimento': '🚑'
        };
        
        const priorityClass = {
            'alert': 'priority-alert',
            'gestione': 'priority-gestione',
            'dimissione': 'priority-dimissione',
            'trasferimento': 'priority-trasferimento'
        };
        
        return `
            <div class="patient-card ${priorityClass[patient.priority]}">
                <div class="patient-header">
                    <h3>${patient.name}</h3>
                    <div class="patient-actions">
                        <button onclick="patientManager.openMoveModal('${patient.id}')" class="btn btn-move" title="Sposta paziente">🔄</button>
                        <button onclick="patientManager.openModal('${patient.id}')" class="btn btn-edit" title="Modifica">✏️</button>
                        <button onclick="patientManager.deletePatient('${patient.id}')" class="btn btn-delete" title="Elimina">🗑️</button>
                    </div>
                </div>
                <div class="patient-info">
                    <div class="info-row">
                        <span class="label">Età:</span> ${patient.age} anni
                    </div>
                    <div class="info-row">
                        <span class="label">Letto:</span> ${patient.room}
                    </div>
                    <div class="info-row">
                        <span class="label">Priorità:</span> ${priorityEmoji[patient.priority]} ${patient.priority.charAt(0).toUpperCase() + patient.priority.slice(1)}
                    </div>
                    ${patient.recentHistory ? `<div class="info-section"><strong>🩺 Anamnesi Recente:</strong><br>${patient.recentHistory}</div>` : ''}
                    ${patient.pastHistory ? `<div class="info-section"><strong>📋 Anamnesi Remota:</strong><br>${patient.pastHistory}</div>` : ''}
                    ${patient.management ? `<div class="info-section"><strong>💊 Decorso e Programma:</strong><br>${patient.management}</div>` : ''}
                    ${patient.notes ? `<div class="info-section"><strong>📝 Note:</strong><br>${patient.notes}</div>` : ''}
                </div>
                <div class="patient-footer">
                    <small>Ultimo aggiornamento: ${new Date(patient.lastUpdate).toLocaleString('it-IT')}</small>
                </div>
            </div>
        `;
    }

    openMoveModal(patientId) {
        this.currentMovePatientId = patientId;
        const patient = this.patients.find(p => p.id === patientId);
        
        if (patient) {
            document.getElementById('currentPatientName').textContent = patient.name;
            document.getElementById('currentPatientRoom').textContent = patient.room;
            document.getElementById('newRoom').value = '';
            document.getElementById('conflictWarning').style.display = 'none';
            document.getElementById('moveModal').style.display = 'block';
        }
    }

    closeMoveModal() {
        document.getElementById('moveModal').style.display = 'none';
        this.currentMovePatientId = null;
    }

    checkRoomConflict(newRoom) {
        return this.patients.find(p => p.room === newRoom && p.id !== this.currentMovePatientId);
    }

    showRoomConflict(conflictPatient) {
        document.getElementById('conflictPatientName').textContent = conflictPatient.name;
        document.getElementById('conflictPatientRoom').textContent = conflictPatient.room;
        document.getElementById('conflictWarning').style.display = 'block';
    }

    async movePatient(e) {
        e.preventDefault();
        
        const newRoom = document.getElementById('newRoom').value.trim();
        const patient = this.patients.find(p => p.id === this.currentMovePatientId);
        
        if (!patient) return;
        
        const conflictPatient = this.checkRoomConflict(newRoom);
        
        if (conflictPatient) {
            this.showRoomConflict(conflictPatient);
            
            if (confirm(`Il letto ${newRoom} è occupato da ${conflictPatient.name}. Vuoi scambiare i pazienti?`)) {
                await this.performSwap(patient, conflictPatient, newRoom);
            }
        } else {
            await this.performMove(patient, newRoom);
        }
    }

    async performMove(patient, newRoom) {
        const oldRoom = patient.room;
        patient.room = newRoom;
        patient.lastUpdate = new Date().toISOString();
        
        await this.saveData();
        this.renderPatients();
        this.closeMoveModal();
        this.updateLastUpdateTime();
        
        alert(`${patient.name} spostato dal letto ${oldRoom} al letto ${newRoom}`);
    }

    async performSwap(patient1, conflictPatient, newRoom) {
        const patient1OldRoom = patient1.room;
        
        patient1.room = newRoom;
        patient1.lastUpdate = new Date().toISOString();
        
        conflictPatient.room = patient1OldRoom;
        conflictPatient.lastUpdate = new Date().toISOString();
        
        await this.saveData();
        this.renderPatients();
        this.closeMoveModal();
        this.updateLastUpdateTime();
        
        alert(`Pazienti scambiati:\n${patient1.name}: ${patient1OldRoom} → ${newRoom}\n${conflictPatient.name}: ${newRoom} → ${patient1OldRoom}`);
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

    // Google Drive Integration con Google Identity Services
    async initGoogleAPI() {
        try {
            console.log('Inizializzazione Google Identity Services...');
            
            // Aspetta che gli script siano caricati
            await this.waitForGoogleScripts();
            
            // Inizializza Google Identity Services
            google.accounts.id.initialize({
                client_id: '23098578039-fqcmp2bh03v5t4ufqlnhon6255s88h57.apps.googleusercontent.com',
                callback: this.handleCredentialResponse.bind(this)
            });
            
            // Inizializza il client OAuth2 per l'accesso alle API
            this.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: '23098578039-fqcmp2bh03v5t4ufqlnhon6255s88h57.apps.googleusercontent.com',
                scope: 'https://www.googleapis.com/auth/drive',
                callback: this.handleTokenResponse.bind(this)
            });
            
            this.googleAPIReady = true;
            this.updateGoogleStatus();
            
            console.log('Google Identity Services inizializzato correttamente');
            
        } catch (error) {
            console.error('Errore nell\'inizializzazione di Google Identity Services:', error);
            this.googleAPIReady = false;
            this.updateGoogleStatus();
        }
    }
    
    async waitForGoogleScripts() {
        return new Promise((resolve) => {
            const checkGoogle = () => {
                if (typeof google !== 'undefined' && typeof gapi !== 'undefined') {
                    resolve();
                } else {
                    setTimeout(checkGoogle, 100);
                }
            };
            checkGoogle();
        });
    }
    
    handleCredentialResponse(response) {
        console.log('Credential response ricevuto:', response);
        // Questo viene chiamato dopo il login con Google Identity
    }
    
    handleTokenResponse(response) {
        console.log('Token response ricevuto:', response);
        if (response.access_token) {
            this.accessToken = response.access_token;
            this.updateGoogleStatus();
            console.log('Token di accesso ottenuto con successo');
        } else {
            console.error('Errore nell\'ottenimento del token:', response);
        }
    }

    async signInGoogle() {
        try {
            console.log('Tentativo di login Google...');
            
            if (!this.googleAPIReady || !this.tokenClient) {
                throw new Error('Google API non inizializzato');
            }
            
            // Richiedi il token di accesso
            this.tokenClient.requestAccessToken({
                prompt: 'consent'
            });
            
        } catch (error) {
            console.error('Errore nel login Google:', error);
            alert('Errore nel login Google: ' + error.message);
        }
    }

    async signOutGoogle() {
        try {
            if (this.accessToken) {
                // Revoca il token
                await fetch(`https://oauth2.googleapis.com/revoke?token=${this.accessToken}`, {
                    method: 'POST',
                    headers: {
                        'Content-type': 'application/x-www-form-urlencoded'
                    }
                });
            }
            
            this.accessToken = null;
            this.updateGoogleStatus();
            console.log('Disconnesso da Google Drive');
            
        } catch (error) {
            console.error('Errore nella disconnessione:', error);
        }
    }

    updateGoogleStatus() {
        const statusElement = document.getElementById('googleStatus');
        const signInBtn = document.getElementById('googleSignInBtn');
        const signOutBtn = document.getElementById('googleSignOutBtn');
        
        if (this.accessToken) {
            statusElement.textContent = '✅ Connesso a Google Drive';
            statusElement.className = 'sync-status connected';
            signInBtn.style.display = 'none';
            signOutBtn.style.display = 'inline-block';
        } else {
            statusElement.textContent = '❌ Non connesso a Google Drive';
            statusElement.className = 'sync-status';
            signInBtn.style.display = 'inline-block';
            signOutBtn.style.display = 'none';
        }
    }

    async syncToGoogleDrive() {
        if (!this.accessToken) {
            throw new Error('Token di accesso non disponibile');
        }
        
        try {
            const folderId = await this.getOrCreateFolder();
            const fileName = `consegne_${this.computerId}.json`;
            const fileContent = JSON.stringify(this.patients, null, 2);
            
            const existingFile = await this.findFileInFolder(folderId, fileName);
            
            if (existingFile) {
                await this.updateFile(existingFile.id, fileContent);
                console.log('File aggiornato su Google Drive');
            } else {
                await this.createFile(folderId, fileName, fileContent);
                console.log('Nuovo file creato su Google Drive');
            }
            
        } catch (error) {
            console.error('Errore nella sincronizzazione:', error);
            throw error;
        }
    }

    async getOrCreateFolder() {
        if (!this.accessToken) {
            throw new Error('Token di accesso non disponibile');
        }
        
        try {
            // Cerca la cartella esistente
            const searchResponse = await fetch(
                `https://www.googleapis.com/drive/v3/files?q=name='Consegne Medicina Urgenza' and mimeType='application/vnd.google-apps.folder'`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                }
            );
            
            const searchData = await searchResponse.json();
            
            if (searchData.files && searchData.files.length > 0) {
                return searchData.files[0].id;
            }
            
            // Crea nuova cartella
            const createResponse = await fetch(
                'https://www.googleapis.com/drive/v3/files',
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: 'Consegne Medicina Urgenza',
                        mimeType: 'application/vnd.google-apps.folder'
                    })
                }
            );
            
            const createData = await createResponse.json();
            return createData.id;
            
        } catch (error) {
            console.error('Errore nella gestione cartella:', error);
            throw error;
        }
    }

    async findFileInFolder(folderId, fileName) {
        try {
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and name='${fileName}'`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                }
            );
            
            const data = await response.json();
            return data.files && data.files.length > 0 ? data.files[0] : null;
            
        } catch (error) {
            console.error('Errore nella ricerca file:', error);
            throw error;
        }
    }

    async createFile(folderId, fileName, content) {
        try {
            const metadata = {
                name: fileName,
                parents: [folderId]
            };
            
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'}));
            form.append('file', new Blob([content], {type: 'application/json'}));
            
            const response = await fetch(
                'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    },
                    body: form
                }
            );
            
            return await response.json();
            
        } catch (error) {
            console.error('Errore nella creazione file:', error);
            throw error;
        }
    }

    async updateFile(fileId, content) {
        try {
            const response = await fetch(
                `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
                {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: content
                }
            );
            
            return await response.json();
            
        } catch (error) {
            console.error('Errore nell\'aggiornamento file:', error);
            throw error;
        }
    }

    async loadFromGoogleDrive() {
        if (!this.accessToken) {
            throw new Error('Token di accesso non disponibile');
        }
        
        try {
            const folderId = await this.getOrCreateFolder();
            const fileName = `consegne_${this.computerId}.json`;
            const file = await this.findFileInFolder(folderId, fileName);
            
            if (file) {
                const response = await fetch(
                    `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
                    {
                        headers: {
                            'Authorization': `Bearer ${this.accessToken}`
                        }
                    }
                );
                
                const content = await response.text();
                const data = JSON.parse(content);
                
                this.patients = data;
                this.saveLocalData();
                
                console.log('Dati caricati da Google Drive');
            } else {
                console.log('Nessun file trovato su Google Drive');
            }
            
        } catch (error) {
            console.error('Errore nel caricamento da Google Drive:', error);
            throw error;
        }
    }

    toggleAutoSync(enabled) {
        this.autoSyncEnabled = enabled;
        const statusElement = document.getElementById('syncStatus');
        
        if (enabled) {
            statusElement.textContent = '🟢 Auto-sync attivo';
            statusElement.className = 'sync-status active';
            this.startAutoSync();
        } else {
            statusElement.textContent = '🔴 Auto-sync disattivato';
            statusElement.className = 'sync-status inactive';
            this.stopAutoSync();
        }
    }

    startAutoSync() {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
        }
        
        this.autoSyncInterval = setInterval(async () => {
            if (this.googleAPIReady && this.accessToken) {
                try {
                    await this.syncToGoogleDrive();
                    console.log('Auto-sync completato');
                } catch (error) {
                    console.error('Errore nell\'auto-sync:', error);
                }
            }
        }, 30000); // Sync ogni 30 secondi
    }

    stopAutoSync() {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
            this.autoSyncInterval = null;
        }
    }
}

// Inizializza l'applicazione
const patientManager = new PatientManager();
