<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { Editor } from '../editor';
import { Global } from '../../global/global';
import { DocumentManager, OAuthAppConfig, StoredUserToken } from '../documentManager';
import Button from 'primevue/button';
import Accordion from 'primevue/accordion';
import AccordionPanel from 'primevue/accordionpanel';
import AccordionHeader from 'primevue/accordionheader';
import AccordionContent from 'primevue/accordioncontent';
import ToggleSwitch from 'primevue/toggleswitch';
import { useStorage } from '@vueuse/core';
import { useConfirm } from 'primevue/useconfirm';

const editor = Editor.getInstance();
const global = Global.getInstance();
const documentManager = new DocumentManager();
const confirmService = useConfirm();


const isAutoSaveEnabled = useStorage('isAutoSaveEnabled', false) 


// --- Reactive State for UI ---
const activeTab = ref('setupCredentials'); // 'setupCredentials', 'createToken', 'addToken', 'listTokens', 'importDoc'

// For Setup Client Credentials Tab
const newClientSecretJsonInput = ref('');
const newOAuthAppNameInput = ref(''); // Optional name for the OAuth App config

// For Create New Token Tab
const newTokenNameInput = ref('');

// For Add Existing Token Tab
const existingTokenJsonInput = ref('');
const existingTokenNameInput = ref('');

// For Import Document Tab
// const documentIdInput = ref('');
// const fetchedDocumentContent = ref<any | null>(null);

// --- Computed Properties ---

// To refresh the list of OAuth apps for selection
const availableOAuthApps = computed(() => documentManager.oauthAppConfigs);
const selectedOAuthAppIdForNewToken = ref<string | null>(documentManager.activeOAuthAppClientId.value);

// To refresh the list of user tokens for selection
const availableUserTokens = computed(() => documentManager.userTokens);
const selectedUserTokenIdForImport = ref<string | null>(documentManager.activeUserTokenId.value);

// For revealing token JSON
const revealedTokenId = ref<string | null>(null);
const revealedTokenJson = computed(() => {
    if (!revealedTokenId.value) return '';
    const token = documentManager.userTokens.find(t => t.id === revealedTokenId.value);
    if (!token) return '';
    // Only reveal the tokenData part for sharing/copying
    return JSON.stringify(token.tokenData, null, 2);
});

// For current game/mod/dungeon context token selection
const currentConfigKey = ref<string | null>(null);
const currentConfigSelectedTokenId = ref<string | null>(null);

function updateCurrentConfigSelection() {
    currentConfigKey.value = documentManager.getCurrentConfigKey();
    if (currentConfigKey.value) {
        currentConfigSelectedTokenId.value = documentManager.getTokenForConfiguration(currentConfigKey.value);
    } else {
        currentConfigSelectedTokenId.value = null;
    }
}

// Initialize selections after documentManager is ready (though constructor handles some defaults)
onMounted(() => {
    if (documentManager.activeOAuthAppClientId.value) {
        selectedOAuthAppIdForNewToken.value = documentManager.activeOAuthAppClientId.value;
    }
    // The activeUserTokenId is now primarily for the document import tab selection
    // Global default and config-specific are handled separately
    selectedUserTokenIdForImport.value = documentManager.activeUserTokenId.value;
    updateCurrentConfigSelection();
});

// Watch for editor state changes to update config-specific token display
watch(() => editor.state, () => {
    updateCurrentConfigSelection();
}, { deep: true });

watch(() => documentManager.activeOAuthAppClientId.value, (newVal) => {
    selectedOAuthAppIdForNewToken.value = newVal;
});

watch(() => documentManager.activeUserTokenId.value, (newVal) => {
    selectedUserTokenIdForImport.value = newVal;
});

// --- Methods ---
function saveClientCredentials() {
  if (newClientSecretJsonInput.value.trim()) {
    documentManager.saveOAuthAppConfig(newClientSecretJsonInput.value, newOAuthAppNameInput.value.trim() || undefined);
    if (documentManager.successMessage.value) {
      newClientSecretJsonInput.value = '';
      newOAuthAppNameInput.value = '';
    }
  } else {
    documentManager.error.value = "Credentials JSON cannot be empty.";
  }
}

function selectActiveOAuthApp() {
    if (selectedOAuthAppIdForNewToken.value) {
        documentManager.selectOAuthApp(selectedOAuthAppIdForNewToken.value);
    }
}

function deleteOAuthApp(clientId: string) {
    confirmService.require({
        message: `Are you sure you want to delete OAuth App ${clientId} and all its associated tokens? This cannot be undone.`,
        header: 'Confirm Deletion',
        icon: 'pi pi-exclamation-triangle',
        accept: () => {
            documentManager.deleteOAuthAppConfig(clientId);
            updateCurrentConfigSelection(); // Refresh config specific tokens
        }
    });
}

async function startNewTokenAuth() {
  if (!newTokenNameInput.value.trim()) {
    documentManager.error.value = "Please provide a name for the new token.";
    return;
  }
  if (!selectedOAuthAppIdForNewToken.value) {
    documentManager.error.value = "Please select an OAuth App configuration to use.";
    return;
  }
  documentManager.selectOAuthApp(selectedOAuthAppIdForNewToken.value);
  await documentManager.startAuthentication(newTokenNameInput.value.trim());
  if (documentManager.successMessage.value && !documentManager.isOAuthServerWaitingForCallback.value) {
      newTokenNameInput.value = ''; 
  }
}

async function abortNewTokenAuth() {
    await documentManager.abortAuthentication();
}

function addExistingUserToken() {
  if (!existingTokenJsonInput.value.trim()) {
    documentManager.error.value = "Token JSON cannot be empty.";
    return;
  }
  if (!existingTokenNameInput.value.trim()) {
    documentManager.error.value = "Please provide a name for this token.";
    return;
  }

  if (selectedOAuthAppIdForNewToken.value) {
    documentManager.selectOAuthApp(selectedOAuthAppIdForNewToken.value);
  } else {
    documentManager.selectOAuthApp(null); 
  }

  //console.log("Before calling addExistingToken in Vue component (debug logs should now appear):");
  //console.log("selectedOAuthAppIdForNewToken.value (UI selection):", selectedOAuthAppIdForNewToken.value);
  //console.log("documentManager.activeOAuthAppClientId.value (DM state):", documentManager.activeOAuthAppClientId.value);

  documentManager.addExistingToken(existingTokenJsonInput.value, existingTokenNameInput.value.trim());
  if (documentManager.successMessage.value) {
      existingTokenJsonInput.value = '';
      existingTokenNameInput.value = '';
  }
}

function selectActiveUserTokenForImport() {
    if (selectedUserTokenIdForImport.value) {
        documentManager.selectUserToken(selectedUserTokenIdForImport.value);
    }
}

function setTokenAsGlobalDefault(tokenId: string) {
    documentManager.setGlobalDefaultUserToken(tokenId);
}

function toggleRevealToken(tokenId: string) {
    if (revealedTokenId.value === tokenId) {
        revealedTokenId.value = null; // Hide if already revealed
    } else {
        revealedTokenId.value = tokenId;
    }
}

function setTokenForCurrentConfig(tokenId: string) {
    if (currentConfigKey.value) {
        documentManager.setTokenForConfiguration(currentConfigKey.value, tokenId);
        updateCurrentConfigSelection(); // Refresh display
    } else {
        documentManager.error.value = "No active game/mod/dungeon configuration to assign token to.";
    }
}

function deleteUserTokenEntry(tokenId: string) {
    const tokenToDelete = documentManager.userTokens.find(t => t.id === tokenId);
    if (tokenToDelete) {
        confirmService.require({
            message: `Are you sure you want to delete token "${tokenToDelete.userGivenName}"?`,
            header: 'Confirm Deletion',
            icon: 'pi pi-exclamation-triangle',
            accept: () => {
                documentManager.deleteUserToken(tokenId);
                updateCurrentConfigSelection(); // Refresh config specific tokens
            }
        });
    }
}

async function fetchDoc() {
  let docId = editor.activeObject.value.gdoc_id?.trim();
  if (!docId) {
    documentManager.error.value = "gdoc_id field is empty";
    return;
  }
  if (global.storageService.supportsGoogleAuth() && !selectedUserTokenIdForImport.value) {
    documentManager.error.value = "Please select a User Token to use for fetching (from dropdown under 'User Tokens' or by activating one).";
    return;
  }
  documentManager.selectUserToken(selectedUserTokenIdForImport.value); 
  const doc = await documentManager.fetchDocument(docId);
  if(doc){
    editor.activeObject.value.dungeon_content = doc.trim();
    setTimeout(() => {
      if(isAutoSaveEnabled.value){
        editor.saveActiveObject();
      }
    }, 0);
  }

  //console.log("doc", doc);
}

function clearAllGoogleData() {
  confirmService.require({
    message: "Are you sure you want to clear ALL Google OAuth App configurations and ALL User Tokens? This action cannot be undone.",
    header: 'Clear All Data',
    icon: 'pi pi-exclamation-triangle',
    accept: () => {
      documentManager.clearAllData();
      newClientSecretJsonInput.value = '';
      newOAuthAppNameInput.value = '';
      newTokenNameInput.value = '';
      existingTokenJsonInput.value = '';
      existingTokenNameInput.value = '';
      selectedOAuthAppIdForNewToken.value = null;
      selectedUserTokenIdForImport.value = null;
      revealedTokenId.value = null;
      updateCurrentConfigSelection();
    }
  });
}

function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
        documentManager.successMessage.value = "Token JSON copied to clipboard!";
    }).catch(err => {
        documentManager.error.value = "Failed to copy to clipboard: " + err;
    });
}

// Lifecycle Hooks (onUnmounted is handled in DocumentManager's constructor now indirectly via service)
</script>

<template>
  <div class="editor-document">

    <div > <!-- v-if="isElectronEnvironment"-->


      <!-- Error and Loading Messages -->
       <div v-if="documentManager.isLoading.value && !documentManager.isOAuthServerWaitingForCallback.value" class="loading-message">Loading...</div>
      <div v-if="documentManager.successMessage.value" class="success-message">
        <strong>Success:</strong> {{ documentManager.successMessage.value }}
      </div>
      <div v-if="documentManager.error.value" class="error-message">
        <strong>Error:</strong> {{ documentManager.error.value }}
      </div>
      <div v-if="documentManager.isLoading.value && documentManager.isOAuthServerWaitingForCallback.value" class="info-message">
        Waiting for Google authentication callback... 
      </div>

      <Accordion  :value="[]">
        <AccordionPanel value="google-document-integration" style="border: none;">
          <AccordionHeader>
            <h2>Google Documents Integration</h2>
          </AccordionHeader>
          <AccordionContent>
                 <!-- Main Tab Navigation -->
      <div class="main-tabs-nav">
        <Button label="OAuth Apps" @click="activeTab = 'setupCredentials'" :text="activeTab !== 'setupCredentials'" :class="{ 'p-button-text': activeTab !== 'setupCredentials' }"></Button>
        <Button label="Create New Token" @click="activeTab = 'createToken'" :text="activeTab !== 'createToken'" :class="{ 'p-button-text': activeTab !== 'createToken' }"></Button>
        <Button label="Add Existing Token" @click="activeTab = 'addToken'" :text="activeTab !== 'addToken'" :class="{ 'p-button-text': activeTab !== 'addToken' }"></Button>
        <Button label="User Tokens" @click="activeTab = 'listTokens'" :text="activeTab !== 'listTokens'" :class="{ 'p-button-text': activeTab !== 'listTokens' }"></Button>
       <!-- <Button label="Import Document" @click="activeTab = 'importDoc'" :text="activeTab !== 'importDoc'" :class="{ 'p-button-text': activeTab !== 'importDoc' }"></Button>-->
      </div>

      <!-- Tab Content Area -->
      <div class="tab-content-area">

        <!-- 1. Setup Client Credentials (OAuth Apps) Tab -->
        <div v-if="activeTab === 'setupCredentials'" class="config-section credentials_popup">
          <h3>OAuth App Configurations</h3>
          <p>
            Create OAuth 2.0 Client ID credentials at
            <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">Google Cloud Console</a>.
          </p>
          <textarea v-model="newClientSecretJsonInput" rows="5" placeholder="Paste content of your client_secret.json here"></textarea>
          <input type="text" v-model="newOAuthAppNameInput" placeholder="Optional: Give this OAuth App a name (e.g., 'My Project')" />
          <Button label="Save OAuth App Configuration" @click="saveClientCredentials" icon="pi pi-save" />
          
          <div v-if="availableOAuthApps.length > 0" class="oauth-app-list">
            <h4>Saved OAuth App Configurations:</h4>
            <ul>
              <li v-for="appConfig in availableOAuthApps" :key="appConfig.clientId" :class="{'active-selection': appConfig.clientId === selectedOAuthAppIdForNewToken }">
                <strong>{{ appConfig.appName || appConfig.clientId }}</strong> (Client ID: {{ appConfig.clientId }})
                 <Button 
                    :label="appConfig.clientId !== selectedOAuthAppIdForNewToken ? 'Select for New Tokens' : '✓ Selected for New Tokens'" 
                    @click="selectedOAuthAppIdForNewToken = appConfig.clientId; selectActiveOAuthApp();" 
                    :class="{'p-button-sm':true, 'p-button-success': appConfig.clientId === selectedOAuthAppIdForNewToken}" 
                    :outlined="appConfig.clientId !== selectedOAuthAppIdForNewToken" />
                <Button icon="pi pi-trash" @click="deleteOAuthApp(appConfig.clientId)" severity="danger" class="p-button-sm p-button-outlined" aria-label="Delete OAuth App" />
              </li>
            </ul>
          </div>
           <div v-else class="info-message">No OAuth App configurations saved yet.</div>
        </div>

        <!-- 2. Create New Token Tab -->
        <div v-if="activeTab === 'createToken'" class="config-section setup_token_popup">
          <h3>Create New User Token via Google OAuth</h3>
          <div v-if="!selectedOAuthAppIdForNewToken" class="warn-message">
            Please select an active OAuth App configuration from the "OAuth Apps" tab first.
          </div>
          <div v-else>
            <p>Using OAuth App: <strong>{{ documentManager.oauthAppConfigs.find(a => a.clientId === selectedOAuthAppIdForNewToken)?.appName || selectedOAuthAppIdForNewToken }}</strong></p>
            <input type="text" v-model="newTokenNameInput" placeholder="Enter a unique name for this token (e.g., 'My Main Account Token')" />
            <Button 
              @click="documentManager.isOAuthServerWaitingForCallback.value ? abortNewTokenAuth() : startNewTokenAuth()" 
              :disabled="documentManager.isLoading.value && !documentManager.isOAuthServerWaitingForCallback.value" 
              :label="documentManager.isOAuthServerWaitingForCallback.value ? 'Abort Authentication' : 'Start Authentication with Google'"
              :icon="documentManager.isOAuthServerWaitingForCallback.value ? 'pi pi-times-circle' : 'pi pi-google'"
              :severity="documentManager.isOAuthServerWaitingForCallback.value ? 'warn' : 'primary'"
            />
            <p class="small-text" v-if="!documentManager.isOAuthServerWaitingForCallback.value">
              {{ documentManager.isLocalhost.value
                ? 'Click to start authentication. A link will appear to complete the process.'
                : 'This will open a Google authentication window.' }}
            </p>
            <p class="small-text" v-if="documentManager.isOAuthServerWaitingForCallback.value && !documentManager.pendingAuthUrl.value">
              Authentication in progress. Click abort to stop and cancel.
            </p>
            <div v-if="documentManager.pendingAuthUrl.value" class="auth-link-inline" style="margin-top: 8px;">
              <a :href="documentManager.pendingAuthUrl.value" target="_blank" rel="noopener noreferrer" class="auth-link">
                Click here to authenticate with Google →
              </a>
              <p class="small-text" style="margin-top: 4px;">After authenticating, return here. Click abort to cancel.</p>
            </div>
          </div>
        </div>

        <!-- 3. Add Existing Token Tab -->
        <div v-if="activeTab === 'addToken'" class="config-section">
          <h3>Add Existing User Token</h3>
           <div>
            <p v-if="selectedOAuthAppIdForNewToken">Token will be associated with OAuth App: <strong>{{ documentManager.oauthAppConfigs.find(a => a.clientId === selectedOAuthAppIdForNewToken)?.appName || selectedOAuthAppIdForNewToken }}</strong></p>
            <p v-else class="small-text">No OAuth App is currently selected. The token will be added without a specific OAuth App linkage (you can still use it directly).</p>
            <input type="text" v-model="existingTokenNameInput" placeholder="Enter a unique name for this token" />
            <textarea v-model="existingTokenJsonInput" rows="3" :placeholder="'Paste token data, e.g., { \'access_token\': \'value\', ... }'"></textarea>
            <Button label="Add Existing Token" @click="addExistingUserToken" :disabled="documentManager.isLoading.value" icon="pi pi-plus" />
          </div>
        </div>

        <!-- 4. List of Tokens Tab -->
        <div v-if="activeTab === 'listTokens'" class="config-section user-token-list">
          <h3>Available User Tokens</h3>
          <p v-if="currentConfigKey">Tokens for configuration: <strong>{{ currentConfigKey }}</strong></p>
          <div v-if="availableUserTokens.length > 0">
            <ul>
              <li v-for="token in availableUserTokens" :key="token.id" 
                  :class="{ 
                      'active-token-import': token.id === selectedUserTokenIdForImport,
                      'global-default-token': token.id === documentManager.globalDefaultUserTokenId.value,
                      'config-default-token': token.id === currentConfigSelectedTokenId
                  }">
                <div class="token-actions">
                  <Button 
                    @click="setTokenAsGlobalDefault(token.id)" 
                    :icon="token.id === documentManager.globalDefaultUserTokenId.value ? 'pi pi-star-fill' : 'pi pi-star'" 
                    :title="token.id === documentManager.globalDefaultUserTokenId.value ? 'Unset as Global Default' : 'Set as Global Default'" 
                    class="p-button-rounded p-button-text" 
                    :severity="token.id === documentManager.globalDefaultUserTokenId.value ? 'warning' : 'secondary'" />
                  <Button 
                    icon="pi pi-eye" 
                    @click="toggleRevealToken(token.id)" 
                    title="Reveal/Hide Token JSON" 
                    class="p-button-rounded p-button-text p-button-secondary" />
                  <span class="token-name" @click="setTokenForCurrentConfig(token.id)" title="Click to set for current game/mod/dungeon config">{{ token.userGivenName }}</span>
                  <Button 
                    @click="deleteUserTokenEntry(token.id)"
                    icon="pi pi-trash" 
                    severity="danger" 
                    class="p-button-sm p-button-rounded p-button-text delete-icon"
                    aria-label="Delete Token" />
                </div>
                <div v-if="token.googleUser" class="token-profile-info">
                  <img v-if="token.googleUser.picture" :src="token.googleUser.picture" alt="User" class="profile-pic-small"/>
                  <span>{{ token.googleUser.name }}</span>
                </div>
                <div v-else class="info-message small-text token-profile-info">Google User profile not available.</div>
                <div class="token-associations">
                    <small>OAuth App: 
                        <template v-if="token.linkedOAuthAppClientId">
                            {{ documentManager.oauthAppConfigs.find(a => a.clientId === token.linkedOAuthAppClientId)?.appName || token.linkedOAuthAppClientId.substring(0,10) }}...
                        </template>
                        <template v-else>
                            N/A (Standalone Token)
                        </template>
                    </small><br/>
                    <small v-if="token.id === documentManager.globalDefaultUserTokenId.value" class="global-default-indicator"> (Global Default)</small>
                    <small v-if="token.id === currentConfigSelectedTokenId" class="config-default-indicator"> (Set for {{currentConfigKey}})</small>
                </div>
                <div v-if="revealedTokenId === token.id" class="token-reveal-json">
                    <textarea readonly rows="8">{{ revealedTokenJson }}</textarea>
                    <Button label="Copy JSON" @click="copyToClipboard(revealedTokenJson)" icon="pi pi-copy" class="p-button-sm" />
                </div>
              </li>
            </ul>
            <div>
                <label for="user-token-select-import">Active Token for <strong>Import Document</strong> tab:</label>
                <select id="user-token-select-import" v-model="selectedUserTokenIdForImport" @change="selectActiveUserTokenForImport">
                    <option :value="null" disabled>Select a User Token for Import</option>
                    <option v-for="tokenEntry in availableUserTokens" :key="tokenEntry.id" :value="tokenEntry.id">
                    {{ tokenEntry.userGivenName }}
                    </option>
                </select>
                 <span v-if="selectedUserTokenIdForImport" class="active-indicator">✓ Selected for fetching the document</span>
            </div>
          </div>
          <div v-else class="info-message">No user tokens found. Please create one or add an existing token.</div>
        </div>

        <!-- 5. Import Google Document Tab 
        <div v-if="activeTab === 'importDoc'" class="config-section document-import">
          <h3>Import Google Document</h3>
          <div v-if="!selectedUserTokenIdForImport" class="warn-message">
            Please select an active User Token from the "User Tokens" tab (via dropdown or by activating one) to use for fetching.
          </div>
          <div v-else>
            <p>Using Token for Import: 
                <strong>{{ documentManager.userTokens.find(t=>t.id === selectedUserTokenIdForImport)?.userGivenName }}</strong>
               <span v-if="documentManager.userTokens.find(t=>t.id === selectedUserTokenIdForImport)?.googleUser as any">
                 ({{ (documentManager.userTokens.find(t=>t.id === selectedUserTokenIdForImport)?.googleUser as any).email }})
               </span>
            </p>
            <input type="text" v-model="documentIdInput" placeholder="Enter Google Document ID or URL" />
            <Button label="Fetch Document" @click="fetchDoc" :disabled="documentManager.isLoading.value" icon="pi pi-download" />

            <div v-if="fetchedDocumentContent" class="document-preview">
              <h4>Document: {{ fetchedDocumentContent.title }}</h4>
              <p>Document ID: {{ fetchedDocumentContent.documentId }}</p>
              <pre>{{ JSON.stringify(fetchedDocumentContent, null, 2).substring(0, 1000) + '...' }}</pre>
            </div>
          </div>
        </div>
-->
      </div> <!-- end tab-content-area -->

      <!-- Clear All Data -->
      <div class="config-section clear-all-section">
         <Button label="Clear ALL OAuth Apps & User Tokens" 
            @click="clearAllGoogleData" 
            v-tooltip.right="global.getString('msg.clear_all')"
            :disabled="documentManager.isLoading.value" 
            severity="danger" 
            icon="pi pi-exclamation-triangle" />
      </div>
          </AccordionContent>
        </AccordionPanel>

      </Accordion>

      <div class="fetch-document-section">

          <div v-if="global.storageService.supportsGoogleAuth() && !selectedUserTokenIdForImport" class="warn-message">
            Please select an active User Token from the "User Tokens" tab (via dropdown or by activating one) to use for fetching.
          </div>
          <template v-else>
            <Button raised label="Fetch Google Document" @click="fetchDoc" :disabled="documentManager.isLoading.value" icon="pi pi-download"/>
            <ToggleSwitch v-model="isAutoSaveEnabled" />
            <label>Auto Save</label>

          </template>

      </div>
     


    </div>

  </div>
</template>

<style scoped>
.fetch-document-section{
  display: flex;
  align-items: center;
  margin-left: 15px;
  margin-bottom: 15px;
}

.main-tabs-nav {
  display: flex;
  /* border-bottom: 2px solid #007bff; */ /* Replaced by Button group styling */
  margin-bottom: 1rem;
  gap: 3px;
}
.main-tabs-nav .p-button {
  margin-right: 0;
  border-radius: 4px 4px 0 0 !important; 
  font-size: 0.95em;
  border-bottom: 1px solid transparent; /* For non-active PrimeVue text buttons */
}

.main-tabs-nav .p-button.p-button-text {
  color: black;
    background-color: #e9ecef !important;
   
}

/* Active tab style for PrimeVue text buttons */
.main-tabs-nav .p-button:not(.p-button-text) {
  border-bottom-color: #007bff !important;
  font-weight: bold;
  background-color: #e9ecef !important;
  color: #333 !important;
}


.config-section {
  padding: 1rem;
  border: 1px solid #ccc;
  border-radius: 8px;
  background-color: #f9f9f9;
  margin-bottom: 1.5rem; 
}

.tab-content-area .config-section h3 {
  margin-top: 0;
  color: #333;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.5rem;
  margin-bottom: 1rem;
}
.config-section h4 {
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
  color: #555;
}

textarea, input[type="text"], select {
  width: 100%;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-sizing: border-box;
}
/* PrimeVue Button general styling if needed, though it comes with its own */
.p-button {
    margin-right: 0.5rem;
}

.p-button.p-button-sm {
    margin-left: 0.5rem;
}

.error-message,
.warn-message,
.success-message {
  padding: 0.75rem;
  border-radius: 4px;
  margin: 0 15px;
}
.info-message{
  padding: 0.75rem;
  border-radius: 4px;
  margin: 5px 0px;
}


.error-message {
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}
.success-message {
  background-color: #d4edda; 
  color: #155724;
  border: 1px solid #c3e6cb;
}
.info-message {
  background-color: #d1ecf1;
  color: #0c5460;
  border: 1px solid #bee5eb;
}
.warn-message {
  background-color: #fff3cd;
  color: #856404;
  border: 1px solid #ffeeba;
}

.loading-message {
  font-style: italic;
  color: #555;
  margin-bottom: 1rem;
}
.small-text {
    font-size: 0.9em;
    color: #666;
    margin-top: 0.3rem;
}

.oauth-app-list ul,
.user-token-list ul {
    list-style-type: none;
    padding-left: 0;
}
.oauth-app-list li,
.user-token-list li {
    background-color: #fff;
    border: 1px solid #eee;
    padding: 0.75rem;
    margin-bottom: 0.5rem;
    border-radius: 4px;
    display: flex;
    flex-direction: column; 
    gap: 0.5rem; 
}

.oauth-app-list li.active-selection {
    border-left: 5px solid #28a745; 
}
.oauth-app-list li > strong {
    margin-bottom: 0.25rem; /* Space below the app name */
}
.oauth-app-list li .p-button {
    align-self: flex-start; /* Align buttons to the start of the flex container */
    margin-top: 0.25rem;
}


.user-token-list li .token-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem; 
    width: 100%;
}

.user-token-list li .token-name {
    flex-grow: 1; 
    cursor: pointer;
    font-weight: bold;
}
.user-token-list li .token-name:hover {
    text-decoration: underline;
}

.user-token-list li .delete-icon {
    margin-left: auto; 
}

.user-token-list li.active-token-import {
    border-left: 5px solid #007bff; 
}
.user-token-list li.global-default-token .token-name {
    color: #28a745; 
}
.user-token-list li.config-default-token .token-name {
    color: #fd7e14; 
}

/* .icon-button specific styling might not be fully needed if p-button-text p-button-rounded is used */
.p-button.p-button-text .pi {
    font-size: 1.2em;
}

.token-profile-info {
    font-size: 0.9em;
    color: #555;
}
.token-associations {
    font-size: 0.85em;
    color: #777;
}
.global-default-indicator, .config-default-indicator {
    font-style: italic;
    margin-left: 5px;
}

.profile-pic-small {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    margin-right: 8px;
    vertical-align: middle;
}
.active-indicator {
    font-weight: bold;
    color: green;
    margin-left: 10px;
    font-size: 0.9em;
}

.token-reveal-json {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background-color: #f0f0f0;
    border: 1px solid #ddd;
    border-radius: 4px;
}
.token-reveal-json textarea {
    width: 100%;
    min-height: 100px;
    font-family: var(--font-family-mono);
    font-size: 0.85em;
}

.document-preview {
    margin-top: 1rem;
    padding: 1rem;
    background-color: #eef;
    border: 1px solid #ccf;
    border-radius: 4px;
    max-height: 300px;
    overflow-y: auto;
}
.document-preview pre {
    white-space: pre-wrap;
    word-wrap: break-word;
    font-size: 0.9em;
}
.clear-all-section {
    margin-top: 2rem;
    border-top: 2px dashed #ccc;
    padding-top: 1.5rem;
}

/* Auth link styling for localhost OAuth flow */
.auth-link-inline {
    background: rgba(79, 195, 247, 0.15);
    border: 1px solid rgba(79, 195, 247, 0.4);
    border-radius: 6px;
    padding: 12px;
}

.auth-link {
    color: #4fc3f7;
    font-size: 1.1em;
    font-weight: 500;
    text-decoration: none;
}

.auth-link:hover {
    color: #81d4fa;
    text-decoration: underline;
}


</style>
