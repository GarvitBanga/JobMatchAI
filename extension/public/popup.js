

console.log('Popup script loaded');

document.addEventListener('DOMContentLoaded', function() {
    const scanButton = document.getElementById('scanButton');
    const settingsButton = document.getElementById('settingsButton');
    const helpButton = document.getElementById('helpButton');
    const status = document.getElementById('status');
    const results = document.getElementById('results');
    
    initializePopup();
    
    scanButton.addEventListener('click', handleScanPage);
    settingsButton.addEventListener('click', openSettings);
    helpButton.addEventListener('click', showHelp);
    
    async function initializePopup() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
                showStatus('Cannot scan Chrome internal pages', 'error');
                scanButton.disabled = true;
                return;
            }
            
            const storedResults = await chrome.storage.local.get(['lastScanResults', 'lastScanStatus']);
            
            if (storedResults.lastScanResults && 
                storedResults.lastScanResults.url === tab.url && 
                Date.now() - storedResults.lastScanResults.timestamp < 600000) {
                
                const results = storedResults.lastScanResults.results;
                if (results.success && results.matches) {
                    displayResults(results);
                    const timeAgo = Math.round((Date.now() - storedResults.lastScanResults.timestamp) / 1000);
                    showStatus(`Scan completed ${timeAgo}s ago - ${results.matches.length} matches found!`, 'success');
                    return;
                }
            }
            

            if (storedResults.lastScanResults && 
                Date.now() - storedResults.lastScanResults.timestamp < 120000) { 
                
                const results = storedResults.lastScanResults.results;
                if (results.success && results.matches && results.matches.length > 0) {
                    console.log('Found very recent scan results (different URL):', storedResults.lastScanResults);
                    
                    displayResults(results);
                    const timeAgo = Math.round((Date.now() - storedResults.lastScanResults.timestamp) / 1000);
                    showStatus(`Recent scan completed ${timeAgo}s ago - ${results.matches.length} matches found! (Different page)`, 'success');
                    

                    const freshScanButton = document.createElement('button');
                    freshScanButton.textContent = 'Scan Current Page Instead';
                    freshScanButton.className = 'secondary-button';
                    freshScanButton.onclick = () => {
                        chrome.storage.local.remove(['lastScanResults', 'lastScanStatus']);
                        location.reload();
                    };
                    status.parentNode.insertBefore(freshScanButton, status.nextSibling);
                    
                    return;
                }
            }
            

            if (storedResults.lastScanStatus && 
                storedResults.lastScanStatus.url === tab.url && 
                storedResults.lastScanStatus.status === 'timeout' &&
                Date.now() - storedResults.lastScanStatus.timestamp < 300000) { 
                
                showStatus('Previous scan timed out. Backend may still be processing. Try again or check backend logs.', 'loading');
                

                const checkButton = document.createElement('button');
                checkButton.textContent = 'Check for Results';
                checkButton.onclick = () => checkForStoredResults();
                status.parentNode.insertBefore(checkButton, status.nextSibling);
                
                return;
            }
            

            const settings = await chrome.storage.sync.get(['apiEndpoint', 'resumeData']);
            

            if (settings.resumeData) {
                showStatus('Resume loaded - Better matching available', 'success');
            } else {
                showStatus('No resume uploaded - Basic matching only', 'loading');
            }
            
        } catch (error) {
            console.error('Error initializing popup:', error);
            showStatus('Initialization error', 'error');
        }
    }
    
    async function handleScanPage() {
        try {
            scanButton.disabled = true;
            showStatus('Scanning page for jobs...', 'loading');
            results.classList.add('hidden');
            

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            

            let contentScriptReady = false;
            try {
                const pingResponse = await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
                contentScriptReady = pingResponse && pingResponse.status === 'ready';
            } catch (error) {
                console.log('Content script not ready, injecting...');
            }
            

            if (!contentScriptReady) {
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content.js']
                    });
                    

                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    console.error('Failed to inject content script:', error);
                    throw new Error('Could not inject content script');
                }
            }
            

            const pageContent = await new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_CONTENT' }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response && response.error) {
                        reject(new Error(response.error));
                    } else if (response) {
                        resolve(response);
                    } else {
                        reject(new Error('No response from content script'));
                    }
                });
            });
            
            console.log('Page content extracted:', pageContent);
            
            const messageListener = (message, sender, sendResponse) => {
                if (message.type === 'SCAN_COMPLETE') {
                    displayResults(message.data);
                    scanButton.disabled = false;
                    chrome.runtime.onMessage.removeListener(messageListener);
                } else if (message.type === 'SCAN_TIMEOUT') {
                    showStatus('Processing is taking longer than expected. Check backend logs for progress...', 'loading');
                    
                    setTimeout(() => {
                        showTimeoutUI(message.data);
                    }, 2000);
                    
                } else if (message.type === 'SCAN_ERROR') {
                    showStatus(`Scan failed: ${message.data.message}`, 'error');
                    scanButton.disabled = false;
                    chrome.runtime.onMessage.removeListener(messageListener);
                }
            };
            
            chrome.runtime.onMessage.addListener(messageListener);
            
            const checkPendingResults = async (attempt = 1, maxAttempts = 30) => {
                try {
                    const { pendingResults, resultsTimestamp } = await chrome.storage.local.get(['pendingResults', 'resultsTimestamp']);
                    
                    if (pendingResults && resultsTimestamp) {
                        displayResults(pendingResults);
                        scanButton.disabled = false;
                        
                        await chrome.storage.local.remove(['pendingResults', 'resultsTimestamp']);
                        return;
                    }
                    
                    if (attempt < maxAttempts) {
                        const delay = Math.min(1000 + (attempt * 100), 3000);
                        setTimeout(() => checkPendingResults(attempt + 1, maxAttempts), delay);
                    } else {
                        showStatus('Processing is taking longer than expected. Please try refreshing or contact support.', 'error');
                        scanButton.disabled = false;
                    }
                } catch (error) {
                    console.error('Error checking pending results:', error);
                    if (attempt < maxAttempts) {
                        setTimeout(() => checkPendingResults(attempt + 1, maxAttempts), 2000);
                    }
                }
            };
            

            
            const initialResponse = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Extension communication timeout'));
                }, 10000);
                
                chrome.runtime.sendMessage({
                    type: 'SCAN_PAGE',
                    data: {
                        url: tab.url,
                        pageContent: pageContent
                    }
                }, (response) => {
                    clearTimeout(timeout);
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                });
            });
            
            if (initialResponse && initialResponse.status === 'processing') {
                showStatus(initialResponse.message, 'loading');
                
                const jobCount = pageContent.jobElements?.length || pageContent.jobLinks?.length || 0;
                if (jobCount > 10) {
                    showProgressInfo(jobCount);
                }
                
                setTimeout(async () => {
                    try {
                        const { pendingResults } = await chrome.storage.local.get(['pendingResults']);
                        
                        if (pendingResults && pendingResults.timestamp > Date.now() - (5 * 60 * 1000)) {
                            displayResults(pendingResults.data);
                            scanButton.disabled = false;
                            chrome.runtime.onMessage.removeListener(messageListener);
                            
                            chrome.storage.local.remove(['pendingResults']);
                            return;
                        }
                    } catch (error) {
                        console.error('Error in immediate result check:', error);
                    }
                }, 5000);
                
                return;
            }
            
            if (initialResponse && initialResponse.success && initialResponse.matches) {
                displayResults(initialResponse);
                chrome.runtime.onMessage.removeListener(messageListener);
            } else if (initialResponse && !initialResponse.success) {
                throw new Error(initialResponse.error || 'Scan failed');
            }
            
        } catch (error) {
            console.error('Scan error:', error);
            showStatus(`Scan failed: ${error.message}`, 'error');
        } finally {
            if (!status.textContent.includes('Processing') && !status.textContent.includes('longer than expected')) {
                scanButton.disabled = false;
            }
        }
    }
    
    function displayResults(response) {
        const { matches, jobs_found, processing_method, resume_used, api_features } = response;
        

        let statusText = `Found ${jobs_found} jobs`;
        if (resume_used) {
            statusText += ' (Using your resume)';
        }
        if (api_features?.llm_matching) {
            statusText += ' - AI Powered';
        }
        
        showStatus(statusText, 'success');
        

        if (matches && matches.length > 0) {
            results.innerHTML = '';
            
            matches.forEach(job => {
                const jobElement = createJobElement(job);
                results.appendChild(jobElement);
            });
            
            results.classList.remove('hidden');
        } else {
            results.innerHTML = '<div class="job-item">No matching jobs found on this page</div>';
            results.classList.remove('hidden');
        }
    }
    
    function createJobElement(job) {
        const jobDiv = document.createElement('div');
        jobDiv.className = 'job-item';
        
        const matchScore = job.match_score || 0;
        const matchColor = matchScore >= 80 ? '#10b981' : matchScore >= 60 ? '#f59e0b' : '#ef4444';
        
        jobDiv.innerHTML = `
            <div class="job-title">${job.title || 'Job Title'}</div>
            <div class="job-company">${job.company || 'Company'} • ${job.location || 'Location'}</div>
            <div style="margin-top: 8px;">
                <span class="match-score" style="background-color: ${matchColor}">
                    ${matchScore}% match
                </span>
            </div>
            ${job.matching_skills && job.matching_skills.length > 0 ? `
                <div style="margin-top: 8px; font-size: 11px; opacity: 0.8;">
                    Skills: ${job.matching_skills.slice(0, 3).join(', ')}
                </div>
            ` : ''}
            ${job.summary ? `
                <div style="margin-top: 6px; font-size: 11px; opacity: 0.9;">
                    ${job.summary}
                </div>
            ` : ''}
        `;
        

        if (job.url) {
            jobDiv.style.cursor = 'pointer';
            jobDiv.addEventListener('click', () => {
                chrome.tabs.create({ url: job.url });
            });
        }
        
        return jobDiv;
    }
    
    function showStatus(message, type = 'loading') {
        status.textContent = message;
        status.className = `status ${type}`;
        status.classList.remove('hidden');
    }
    
    function openSettings() {
        chrome.runtime.openOptionsPage();
    }
    
    function showHelp() {
        const helpText = `
How to use JobMatch:

1. Upload Resume (Optional):
   • Click Settings → Upload resume file
   • Get better job matching

2. Scan Job Pages:
   • Visit any career page
   • Click "Scan Current Page"
   • View matched jobs with scores

3. Best Results:
   • Use on company career pages
   • Works with LinkedIn, Indeed, etc.
   • Higher scores = better matches

Tips:
   • Upload resume for better matching
   • Check Settings for API connection
   • Scan multiple pages for more jobs
        `;
        
        alert(helpText);
    }
    

    function showProgressInfo(jobCount) {
        const progressDiv = document.createElement('div');
        progressDiv.id = 'progress-info';
        progressDiv.style.cssText = `
            margin-top: 10px;
            padding: 8px;
            background-color: rgba(52, 73, 94, 0.3);
            border: 1px solid rgba(52, 152, 219, 0.2);
            border-radius: 8px;
            font-size: 12px;
            color: #95a5a6;
        `;
        
        progressDiv.innerHTML = `
            <div style="margin-bottom: 4px;"><span class="loading-spinner"></span>Processing ${jobCount} jobs</div>
            <div style="margin-bottom: 4px;">This may take 1-2 minutes for full content extraction</div>
            <div style="font-size: 11px; opacity: 0.8;">Backend is fetching full job descriptions from individual pages</div>
        `;
        

        status.parentNode.insertBefore(progressDiv, status.nextSibling);
        

        setTimeout(() => {
            if (progressDiv.parentNode) {
                progressDiv.remove();
            }
        }, 30000);
    }
    

    function showTimeoutUI(timeoutData) {
        const timeoutDiv = document.createElement('div');
        timeoutDiv.style.cssText = `
            margin-top: 10px;
            padding: 12px;
            background-color: rgba(241, 196, 15, 0.2);
            border: 1px solid rgba(241, 196, 15, 0.3);
            border-radius: 8px;
            font-size: 12px;
            color: #f1c40f;
        `;
        
        timeoutDiv.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 6px;">Processing Timeout</div>
            <div style="margin-bottom: 8px; color: #95a5a6;">${timeoutData.message}</div>
            <div style="display: flex; gap: 8px;">
                <button id="check-results-btn" style="font-size: 11px; padding: 6px 12px; background: rgba(52, 152, 219, 0.8); color: white; border: none; border-radius: 4px; cursor: pointer;">Check for Results</button>
                <button id="retry-scan-btn" style="font-size: 11px; padding: 6px 12px; background: rgba(52, 73, 94, 0.6); color: white; border: none; border-radius: 4px; cursor: pointer;">Retry Scan</button>
            </div>
        `;
        

        results.innerHTML = '';
        results.appendChild(timeoutDiv);
        results.classList.remove('hidden');
        

        timeoutDiv.querySelector('#check-results-btn').addEventListener('click', checkForStoredResults);
        timeoutDiv.querySelector('#retry-scan-btn').addEventListener('click', () => {
            timeoutDiv.remove();
            handleScanPage();
        });
        
        scanButton.disabled = false;
    }
    

    async function checkForStoredResults() {
        try {
            showStatus('Checking for completed results...', 'loading');
            
            const storedResults = await chrome.storage.local.get(['lastScanResults', 'lastScanStatus']);
            
            if (storedResults.lastScanResults) {
                const results = storedResults.lastScanResults.results;
                const timeAgo = Math.round((Date.now() - storedResults.lastScanResults.timestamp) / 1000);
                

                if (results.success && results.matches) {
                    console.log('Found completed results!', results);
                    

                    if (results.processing_method === 'mock') {
                        console.warn('These are mock/fallback results. Backend processing may have failed.');
                        displayResults(results);
                        showStatus(`Found fallback results (${timeAgo}s ago) - Backend may have timed out. Try scanning again.`, 'loading');
                        

                        const retryButton = document.createElement('button');
                        retryButton.textContent = 'Scan Again with Backend';
                        retryButton.style.cssText = 'margin-top: 8px; padding: 6px 12px; font-size: 12px; background: rgba(52, 152, 219, 0.8); color: white; border: none; border-radius: 4px; cursor: pointer;';
                        retryButton.onclick = () => {

                            chrome.storage.local.remove(['lastScanResults', 'lastScanStatus']);
                            handleScanPage();
                        };
                        status.parentNode.insertBefore(retryButton, status.nextSibling);
                        
                    } else {

                        displayResults(results);
                        showStatus(`Found completed scan results (${timeAgo}s ago) - ${results.matches.length} matches!`, 'success');
                    }
                    
                    scanButton.disabled = false;
                    return;
                }
            }
            
            showStatus('No completed results found. The backend may still be processing.', 'loading');
            
        } catch (error) {
            console.error('Error checking stored results:', error);
            showStatus('Error checking for results', 'error');
        }
    }
});

