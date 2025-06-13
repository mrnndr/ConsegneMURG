class PatientManager {
    constructor() {
        this.patients = [];
        this.currentPatient = null;
        this.currentMovePatient = null;
        this.computerId = this.generateComputerId();
        this.isGoogleSignedIn = false;
        this.autoSyncEnabled = true;
        this.syncInterval = null;
        this.googleAPIReady = false;
        this.accessToken = null;
        this.tokenClient = null;
        
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
        document.getElementById('patientForm').addEventListener('submit', (e) => this.savePatient(e));
        
        // Modal spostamento
        document.getElementById('closeMoveModal').addEventListener('click', () => this.closeMoveModal());
        document.getElementById('cancelMoveBtn').addEventListener('click', () => this.closeMoveModal());
        document.getElementById('moveForm').addEventListener('submit', (e) => this.movePatient(e));
        
        // Controllo conflitto in tempo reale
        document.getElementById('newRoom').addEventListener('input', (e) => {
            const newRoom = e.target.value.trim();
            if (newRoom && this.currentMovePatient) {
                const conflict = this.checkRoomConflict(newRoom);
                const conflictWarning = document.getElementById('conflictWarning');
                
                if (conflict) {
                    this.showRoomConflict(conflict, newRoom);
                } else {
                    conflictWarning.style.display = 'none';
                    const submitBtn = document.querySelector('#moveForm button[type="submit"]');
                    submitBtn.innerHTML = '🔄 Sposta';
                    submitBtn.onclick = null;
                }
            }
        });
        
        // Filtri e ricerca
        document.getElementById('sortByRoomBtn').addEventListener('click', () => this.sortByRoom());
        document.getElementById('filterPriority').addEventListener('change', () => this.renderPatients());
        document.getElementById('searchInput').addEventListener('input', () => this.renderPatients());
        
        // Chiusura modal cliccando fuori
        window.addEventListener('click', (e) => {
            const modal = document.getElementById('patientModal');
            const moveModal = document.getElementById('moveModal');
            if (e.target === modal) this.closeModal();
            if (e.target === moveModal) this.closeMoveModal();
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

    sortByRoom() {
        this.renderPatients(true);
    }

    renderPatients(sortByRoom = false) {
        const container = document.getElementById('patientsContainer');
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

        // Ordina pazienti per numero di letto se richiesto
        if (sortByRoom) {
            filteredPatients.sort((a, b) => {
                const roomA = a.room || '';
                const roomB = b.room || '';
                
                // Estrae i numeri dai nomi delle stanze per un ordinamento numerico intelligente
                const getNumericValue = (room) => {
                    const match = room.match(/\d+/);
                    return match ? parseInt(match[0]) : 999999;
                };
                
                const numA = getNumericValue(roomA);
                const numB = getNumericValue(roomB);
                
                if (numA !== numB) {
                    return numA - numB;
                }
                
                // Se i numeri sono uguali, ordina alfabeticamente
                return roomA.localeCompare(roomB);
            });
        }

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
        
        // Formatta la data di inserimento (usa admissionDate se disponibile, altrimenti lastUpdated)
        const insertDate = new Date(patient.admissionDate || patient.lastUpdated || Date.now());
        const formattedDate = insertDate.toLocaleDateString('it-IT') + ' ' + insertDate.toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'});
        
        card.innerHTML = `
            <div class="patient-header">
                <h3>${patient.name} (${patient.age} anni)</h3>
                <div class="patient-details">
                    <div class="bed-info">🛏️ Letto: ${patient.room}</div>
                    <div class="admission-date">📅 Inserimento: ${formattedDate}</div>
                </div>
            </div>
            <div class="patient-info">
                <div class="info-section">
                    <h4>🩺 Anamnesi Recente</h4>
                    <p>${patient.recentHistory || 'Non specificata'}</p>
                </div>
                <div class="info-section">
                    <h4>📋 Anamnesi Remota</h4>
                    <p>${patient.pastHistory || 'Non specificata'}</p>
                </div>
                <div class="info-section">
                    <h4>💊 Decorso e Programma</h4>
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
                <button onclick="patientManager.openMoveModal('${patient.id}')" class="btn btn-move">🔄 Sposta</button>
                <button onclick="patientManager.deletePatient('${patient.id}')" class="btn btn-delete">🗑️ Elimina</button>
            </div>
        `;
        return card;
    }

    // Funzioni per spostamento pazienti
    openMoveModal(patientId) {
        const patient = this.patients.find(p => p.id === patientId);
        if (!patient) return;
        
        this.currentMovePatient = patient;
        
        // Popola i dati del paziente corrente
        document.getElementById('currentPatientName').textContent = patient.name;
        document.getElementById('currentPatientRoom').textContent = patient.room;
        document.getElementById('newRoom').value = '';
        
        // Nasconde il warning di conflitto
        document.getElementById('conflictWarning').style.display = 'none';
        
        // Mostra il modal
        document.getElementById('moveModal').style.display = 'block';
    }

    closeMoveModal() {
        document.getElementById('moveModal').style.display = 'none';
        this.currentMovePatient = null;
    }

    checkRoomConflict(newRoom) {
        return this.patients.find(p => 
            p.room.toLowerCase() === newRoom.toLowerCase() && 
            p.id !== this.currentMovePatient.id
        );
    }

    showRoomConflict(conflictPatient, newRoom) {
        const conflictWarning = document.getElementById('conflictWarning');
        const conflictPatientName = document.getElementById('conflictPatientName');
        const conflictPatientRoom = document.getElementById('conflictPatientRoom');
        const submitBtn = document.querySelector('#moveForm button[type="submit"]');
        
        conflictPatientName.textContent = conflictPatient.name;
        conflictPatientRoom.textContent = conflictPatient.room;
        conflictWarning.style.display = 'block';
        
        // Cambia il pulsante per permettere lo scambio
        submitBtn.innerHTML = '🔄 Scambia Pazienti';
        submitBtn.onclick = (e) => {
            e.preventDefault();
            this.performSwap(newRoom, conflictPatient);
        };
    }

    movePatient(e) {
        e.preventDefault();
        
        const newRoom = document.getElementById('newRoom').value.trim();
        if (!newRoom) {
            alert('Inserisci il nuovo letto');
            return;
        }
        
        const conflict = this.checkRoomConflict(newRoom);
        if (conflict) {
            // Se c'è conflitto, il pulsante dovrebbe già essere configurato per lo scambio
            return;
        }
        
        this.performMove(newRoom);
    }

    performMove(newRoom) {
        const oldRoom = this.currentMovePatient.room;
        
        // Aggiorna il letto del paziente
        const patientIndex = this.patients.findIndex(p => p.id === this.currentMovePatient.id);
        if (patientIndex !== -1) {
            this.patients[patientIndex].room = newRoom;
            this.patients[patientIndex].lastUpdated = new Date().toISOString();
        }
        
        this.saveData();
        this.renderPatients();
        this.closeMoveModal();
        this.updateLastUpdateTime();
        
        alert(`Paziente ${this.currentMovePatient.name} spostato da ${oldRoom} a ${newRoom}`);
    }

    performSwap(newRoom, conflictPatient) {
        const patient1 = this.currentMovePatient;
        const patient1OldRoom = patient1.room;
        
        // Trova gli indici dei pazienti
        const patient1Index = this.patients.findIndex(p => p.id === patient1.id);
        const patient2Index = this.patients.findIndex(p => p.id === conflictPatient.id);
        
        if (patient1Index !== -1 && patient2Index !== -1) {
            // Scambia i letti
            this.patients[patient1Index].room = newRoom;
            this.patients[patient1Index].lastUpdated = new Date().toISOString();
            
            this.patients[patient2Index].room = patient1OldRoom;
            this.patients[patient2Index].lastUpdated = new Date().toISOString();
        }
        
        this.saveData();
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

    // Google Drive Integration con nuovo Google Identity Services
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
                if (typeof google !== 'undefined') {
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
            this.isGoogleSignedIn = true;
            this.updateGoogleStatus();
            this.loadFromGoogleDrive();
        } else {
            console.error('Errore nel token response:', response);
        }
    }

    async signInGoogle() {
        try {
            console.log('Tentativo di login Google...');
            
            if (!this.googleAPIReady) {
                alert('Google API non ancora pronto. Riprova tra qualche secondo.');
                return;
            }
            
            if (!this.tokenClient) {
                throw new Error('Token client non inizializzato');
            }
            
            // Richiedi il token di accesso
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
            
        } catch (error) {
            console.error('Errore nel login Google:', error);
            alert('Errore durante il login Google: ' + (error.message || error));
        }
    }

    async signOutGoogle() {
        try {
            if (this.accessToken) {
                google.accounts.oauth2.revoke(this.accessToken);
                this.accessToken = null;
            }
            
            this.isGoogleSignedIn = false;
            this.updateGoogleStatus();
            
            console.log('Disconnesso da Google Drive');
            
        } catch (error) {
            console.error('Errore durante la disconnessione:', error);
        }
    }

    updateGoogleStatus() {
        const statusElement = document.getElementById('googleStatus');
        const signInBtn = document.getElementById('googleSignInBtn');
        const signOutBtn = document.getElementById('googleSignOutBtn');
        
        if (this.isGoogleSignedIn) {
            statusElement.textContent = '✅ Connesso a Google Drive';
            statusElement.className = 'sync-status active';
            signInBtn.style.display = 'none';
            signOutBtn.style.display = 'inline-block';
        } else {
            statusElement.textContent = '❌ Non connesso a Google Drive';
            statusElement.className = 'sync-status';
            signInBtn.style.display = 'inline-block';
            signOutBtn.style.display = 'none';
        }
    }

    toggleAutoSync(enabled) {
        this.autoSyncEnabled = enabled;
        const syncStatus = document.getElementById('syncStatus');
        
        if (enabled) {
            syncStatus.textContent = '🟢 Auto-sync attivo';
            syncStatus.className = 'sync-status active';
            this.startAutoSync();
        } else {
            syncStatus.textContent = '🔴 Auto-sync disattivo';
            syncStatus.className = 'sync-status';
            this.stopAutoSync();
        }
    }

    startAutoSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        
        // Sincronizza ogni 5 minuti se connesso a Google Drive
        this.syncInterval = setInterval(() => {
            if (this.isGoogleSignedIn && this.autoSyncEnabled) {
                this.syncToGoogleDrive();
            }
        }, 5 * 60 * 1000);
    }

    stopAutoSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    async getOrCreateFolder() {
        try {
            const response = await fetch('https://www.googleapis.com/drive/v3/files?q=name="Consegne_Medicina_Urgenza"+and+mimeType="application/vnd.google-apps.folder"', {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });
            
            const data = await response.json();
            
            if (data.files && data.files.length > 0) {
                return data.files[0].id;
            } else {
                // Crea la cartella
                const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: 'Consegne_Medicina_Urgenza',
                        mimeType: 'application/vnd.google-apps.folder'
                    })
                });
                
                const createData = await createResponse.json();
                return createData.id;
            }
        } catch (error) {
            console.error('Errore nella gestione della cartella:', error);
            throw error;
        }
    }

    async syncToGoogleDrive() {
        if (!this.isGoogleSignedIn || !this.accessToken) {
            console.log('Non connesso a Google Drive');
            return;
        }

        try {
            console.log('Sincronizzazione con Google Drive...');
            
            const folderId = await this.getOrCreateFolder();
            const fileName = `consegne_${this.computerId}.json`;
            
            // Cerca il file esistente
            const searchResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=name="${fileName}"+and+parents+in+"${folderId}"`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });
            
            const searchData = await searchResponse.json();
            
            const dataToSync = {
                patients: this.patients,
                lastUpdated: new Date().toISOString(),
                computerId: this.computerId
            };
            
            const fileContent = JSON.stringify(dataToSync, null, 2);
            
            if (searchData.files && searchData.files.length > 0) {
                // Aggiorna il file esistente
                const fileId = searchData.files[0].id;
                
                const updateResponse = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: fileContent
                });
                
                if (updateResponse.ok) {
                    console.log('File aggiornato su Google Drive');
                } else {
                    throw new Error('Errore nell\'aggiornamento del file');
                }
            } else {
                // Crea un nuovo file
                const createResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'multipart/related; boundary="foo_bar_baz"'
                    },
                    body: [
                        '--foo_bar_baz',
                        'Content-Type: application/json; charset=UTF-8',
                        '',
                        JSON.stringify({
                            name: fileName,
                            parents: [folderId]
                        }),
                        '--foo_bar_baz',
                        'Content-Type: application/json',
                        '',
                        fileContent,
                        '--foo_bar_baz--'
                    ].join('\r\n')
                });
                
                if (createResponse.ok) {
                    console.log('Nuovo file creato su Google Drive');
                } else {
                    throw new Error('Errore nella creazione del file');
                }
            }
            
        } catch (error) {
            console.error('Errore nella sincronizzazione:', error);
        }
    }

    async loadFromGoogleDrive() {
        if (!this.isGoogleSignedIn || !this.accessToken) {
            console.log('Non connesso a Google Drive');
            return;
        }

        try {
            console.log('Caricamento da Google Drive...');
            
            const folderId = await this.getOrCreateFolder();
            const fileName = `consegne_${this.computerId}.json`;
            
            // Cerca il file
            const searchResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=name="${fileName}"+and+parents+in+"${folderId}"`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });
            
            const searchData = await searchResponse.json();
            
            if (searchData.files && searchData.files.length > 0) {
                const fileId = searchData.files[0].id;
                
                // Scarica il contenuto del file
                const downloadResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                });
                
                if (downloadResponse.ok) {
                    const fileContent = await downloadResponse.text();
                    const data = JSON.parse(fileContent);
                    
                    if (data.patients) {
                        this.patients = data.patients;
                        this.saveLocalData();
                        this.renderPatients();
                        console.log('Dati caricati da Google Drive:', this.patients.length, 'pazienti');
                    }
                } else {
                    throw new Error('Errore nel download del file');
                }
            } else {
                console.log('Nessun file trovato su Google Drive per questo computer');
            }
            
        } catch (error) {
            console.error('Errore nel caricamento da Google Drive:', error);
        }
    }
}

// Inizializza l'applicazione
let patientManager;

window.addEventListener('DOMContentLoaded', () => {
    patientManager = new PatientManager();
});
