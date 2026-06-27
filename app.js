let currentProject = null;
let accessToken = null;
let allFilesData = [];

// 1. Initialiser Workspace API-et mot foreldrevinduet (Trimble Connect Web)
TrimbleConnectWorkspace.connect(window.parent, (interaction, baseUrl) => {
    
    // Hent prosjektinformasjon og token når forbindelsen er opprettet
    Promise.all([
        interaction.request('getProjectInfo'),
        interaction.request('getAccessToken')
    ]).then(([projectInfo, token]) => {
        currentProject = projectInfo;
        accessToken = token;
        
        // Start uthenting av filer (Her kan du eventuelt sende med en spesifikk mappe-ID som parentId)
        fetchProjectFiles(currentProject.id);
    }).catch(error => {
        console.error("Feil under initialisering:", error);
        document.getElementById('tableBody').innerHTML = `<tr><td colspan="9" style="color:red;">Kunne ikke koble til Trimble Connect API.</td></tr>`;
    });
}, "*");

// 2. Hent filer fra prosjektet via Trimble Connect REST API
async function fetchProjectFiles(projectId) {
    try {
        // Merk: Endepunkt og paginering kan tilpasses ut fra hvor mange filer prosjektet har
        const url = `https://api.connect.trimble.com/tc/v1/projects/${projectId}/items?type=file`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });
        
        const files = await response.json();
        
        // Filtrer ut f.eks. kun IFC-filer hvis ønskelig
        const modelFiles = files.filter(file => file.name.toLowerCase().endsWith('.ifc'));
        
        // For hver fil må vi hente metadata/Custom Properties
        allFilesData = await Promise.all(modelFiles.map(async (file) => {
            const metadata = await fetchFileMetadata(projectId, file.id);
            return {
                id: file.id,
                name: file.name,
                ...metadata // Merger inn egenskapene vi fant
            };
        }));
        
        renderTable(allFilesData);
        setupSearch();
        
    } catch (error) {
        console.error("Feil ved henting av filer:", error);
    }
}

// 3. Hent Custom Properties (Metadata) for den enkelte filen
async function fetchFileMetadata(projectId, fileId) {
    // Standard fallback-verdier hvis metadata ikke finnes på filen enda
    const defaultMeta = {
        fag: "-",
        mmi: "-",
        revisjon: "-",
        revisjonsdato: "-",
        gjelder: "-",
        utarbeidet: "-",
        kontrollert: "-",
        godkjent: "-"
    };
    
    try {
        // Endepunkt for å hente brukerdefinerte egenskaper knyttet til dokumentet
        const url = `https://api.connect.trimble.com/tc/v1/projects/${projectId}/items/${fileId}/properties`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (!response.ok) return defaultMeta;
        
        const propsData = await response.json();
        
        // Gitt at egenskapene dine er lagret med spesifikke nøkler (keys), mapper vi dem her:
        return {
            fag: propsData["Underdisiplin"] || propsData["Fag"] || "-",
            mmi: propsData["MMI"] || "-",
            revisjon: propsData["Revisjon"] || "-",
            revisjonsdato: propsData["Revisjonsdato"] || "-",
            gjelder: propsData["Revisjonen gjelder"] || "-",
            utarbeidet: propsData["Utarbeidet av"] || "-",
            kontrollert: propsData["Kontrollert av"] || "-",
            godkjent: propsData["Godkjent av"] || "-"
        };
        
    } catch (e) {
        return defaultMeta;
    }
}

// 4. Tegn ut tabellen i grensesnittet
function renderTable(data) {
    const tbody = document.getElementById('tableBody');
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">Ingen relevante modellfiler funnet.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = data.map(fil => `
        <tr>
            <td style="font-weight:600; color:#0066cc; cursor:pointer;" onclick="openFileInConnect('${fil.id}')">${fil.name}</td>
            <td>${fil.fag}</td>
            <td>${fil.mmi}</td>
            <td>${fil.revisjon}</td>
            <td>${fil.revisjonsdato}</td>
            <td>${fil.gjelder}</td>
            <td>${fil.utarbeidet}</td>
            <td>${fil.kontrollert}</td>
            <td>${fil.godkjent}</td>
        </tr>
    `).join('');
}

// 5. Enkel søkefunksjon på tvers av alle kolonner
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allFilesData.filter(fil => {
            return fil.name.toLowerCase().includes(term) ||
                   fil.fag.toLowerCase().includes(term) ||
                   fil.mmi.toLowerCase().includes(term) ||
                   fil.utarbeidet.toLowerCase().includes(term);
        });
        renderTable(filtered);
    });
}

// Bonus: Hvis brukeren klikker på filnavnet, kan vi navigere eller åpne filen i Connect
function openFileInConnect(fileId) {
    // Eksempel på hvordan man kan trigge en handling via parent-vinduet hvis ønskelig,
    // eller bare lenke direkte til filens visning i nettleseren.
    window.open(`https://connect.trimble.com/web/project/${currentProject.id}/data/detail/${fileId}`, '_blank');
}