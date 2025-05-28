


class StorageManager {
    constructor() {
        this.storageKeys = {

            RESUME_DATA: 'resumeData',
            RESUME_FILE_CONTENT: 'resumeFileContent',
            RESUME_PARSED: 'resumeParsed',
            

            JOB_RESULTS: 'jobResults',
            SCAN_HISTORY: 'scanHistory',
            CACHED_JOBS: 'cachedJobs',
            

            API_ENDPOINT: 'apiEndpoint',
            MATCH_THRESHOLD: 'matchThreshold',
            AUTO_SCAN: 'autoScan',
            USER_PREFERENCES: 'userPreferences',
            

            CURRENT_SCAN: 'currentScan',
            LAST_PAGE_CONTENT: 'lastPageContent'
        };
        
        this.maxStorageItems = {
            JOB_RESULTS: 100,      
            SCAN_HISTORY: 50,        
            CACHED_JOBS: 200         
        };
    }
    



    
    async saveResumeFile(file, content) {
        try {
            const resumeData = {
                filename: file.name,
                size: file.size,
                type: file.type,
                uploadedAt: new Date().toISOString(),
                content: content 
            };
            
            await chrome.storage.local.set({
                [this.storageKeys.RESUME_FILE_CONTENT]: resumeData
            });
            
            console.log('Resume file saved to storage:', file.name);
            return resumeData;
        } catch (error) {
            console.error('Error saving resume file:', error);
            throw error;
        }
    }
    
    async saveParsedResume(parsedData) {
        try {
            const resumeParsed = {
                ...parsedData,
                parsedAt: new Date().toISOString(),
                version: '1.0'
            };
            
            await chrome.storage.local.set({
                [this.storageKeys.RESUME_PARSED]: resumeParsed
            });
            

            await chrome.storage.sync.set({
                [this.storageKeys.RESUME_DATA]: {
                    hasResume: true,
                    filename: parsedData.filename || 'Unknown',
                    parsedAt: resumeParsed.parsedAt
                }
            });
            
            console.log('Parsed resume saved to storage');
            return resumeParsed;
        } catch (error) {
            console.error('Error saving parsed resume:', error);
            throw error;
        }
    }
    
    async getResumeData() {
        try {
            const result = await chrome.storage.local.get([
                this.storageKeys.RESUME_FILE_CONTENT,
                this.storageKeys.RESUME_PARSED
            ]);
            
            return {
                fileContent: result[this.storageKeys.RESUME_FILE_CONTENT],
                parsedData: result[this.storageKeys.RESUME_PARSED]
            };
        } catch (error) {
            console.error('Error getting resume data:', error);
            return null;
        }
    }
    
    async removeResumeData() {
        try {
            await chrome.storage.local.remove([
                this.storageKeys.RESUME_FILE_CONTENT,
                this.storageKeys.RESUME_PARSED
            ]);
            
            await chrome.storage.sync.remove([this.storageKeys.RESUME_DATA]);
            
            console.log('Resume data removed from storage');
        } catch (error) {
            console.error('Error removing resume data:', error);
            throw error;
        }
    }
    



    
    async saveJobResults(scanData) {
        try {
            const jobResult = {
                id: this.generateId(),
                url: scanData.url,
                scannedAt: new Date().toISOString(),
                jobsFound: scanData.jobs_found || 0,
                matches: scanData.matches || [],
                processingMethod: scanData.processing_method,
                resumeUsed: scanData.resume_used,
                pageTitle: scanData.pageTitle || ''
            };
            

            const existing = await chrome.storage.local.get([this.storageKeys.JOB_RESULTS]);
            const jobResults = existing[this.storageKeys.JOB_RESULTS] || [];
            

            jobResults.unshift(jobResult);
            

            const trimmedResults = jobResults.slice(0, this.maxStorageItems.JOB_RESULTS);
            
            await chrome.storage.local.set({
                [this.storageKeys.JOB_RESULTS]: trimmedResults
            });
            
            console.log('Job results saved to storage:', jobResult.id);
            return jobResult;
        } catch (error) {
            console.error('Error saving job results:', error);
            throw error;
        }
    }
    
    async getJobResults(limit = 10) {
        try {
            const result = await chrome.storage.local.get([this.storageKeys.JOB_RESULTS]);
            const jobResults = result[this.storageKeys.JOB_RESULTS] || [];
            
            return jobResults.slice(0, limit);
        } catch (error) {
            console.error('Error getting job results:', error);
            return [];
        }
    }
    
    async getJobResultById(id) {
        try {
            const results = await this.getJobResults(this.maxStorageItems.JOB_RESULTS);
            return results.find(result => result.id === id);
        } catch (error) {
            console.error('Error getting job result by ID:', error);
            return null;
        }
    }
    



    
    async saveScanHistory(url, pageTitle, jobsFound) {
        try {
            const historyEntry = {
                id: this.generateId(),
                url: url,
                pageTitle: pageTitle || '',
                jobsFound: jobsFound || 0,
                scannedAt: new Date().toISOString()
            };
            
            const existing = await chrome.storage.local.get([this.storageKeys.SCAN_HISTORY]);
            const scanHistory = existing[this.storageKeys.SCAN_HISTORY] || [];
            

            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            const recentScan = scanHistory.find(entry => 
                entry.url === url && entry.scannedAt > oneHourAgo
            );
            
            if (!recentScan) {
                scanHistory.unshift(historyEntry);
                const trimmedHistory = scanHistory.slice(0, this.maxStorageItems.SCAN_HISTORY);
                
                await chrome.storage.local.set({
                    [this.storageKeys.SCAN_HISTORY]: trimmedHistory
                });
                
                console.log('Scan history saved:', url);
            }
            
            return historyEntry;
        } catch (error) {
            console.error('Error saving scan history:', error);
            throw error;
        }
    }
    
    async getScanHistory(limit = 20) {
        try {
            const result = await chrome.storage.local.get([this.storageKeys.SCAN_HISTORY]);
            const scanHistory = result[this.storageKeys.SCAN_HISTORY] || [];
            
            return scanHistory.slice(0, limit);
        } catch (error) {
            console.error('Error getting scan history:', error);
            return [];
        }
    }
    



    
    async savePreferences(preferences) {
        try {
            await chrome.storage.sync.set({
                [this.storageKeys.USER_PREFERENCES]: {
                    ...preferences,
                    updatedAt: new Date().toISOString()
                }
            });
            
            console.log('User preferences saved');
        } catch (error) {
            console.error('Error saving preferences:', error);
            throw error;
        }
    }
    
    async getPreferences() {
        try {
            const result = await chrome.storage.sync.get([
                this.storageKeys.USER_PREFERENCES,
                this.storageKeys.API_ENDPOINT,
                this.storageKeys.MATCH_THRESHOLD,
                this.storageKeys.AUTO_SCAN
            ]);
            
            return {
                ...result[this.storageKeys.USER_PREFERENCES],
                apiEndpoint: result[this.storageKeys.API_ENDPOINT] || 'https://jobmatch-production.up.railway.app/api/v1',
                matchThreshold: result[this.storageKeys.MATCH_THRESHOLD] || 70,
                autoScan: result[this.storageKeys.AUTO_SCAN] || false
            };
        } catch (error) {
            console.error('Error getting preferences:', error);
            return {};
        }
    }
    



    
    async cacheJobData(url, jobData) {
        try {
            const cacheEntry = {
                url: url,
                data: jobData,
                cachedAt: new Date().toISOString(),
                hash: this.hashString(JSON.stringify(jobData))
            };
            
            const existing = await chrome.storage.local.get([this.storageKeys.CACHED_JOBS]);
            const cachedJobs = existing[this.storageKeys.CACHED_JOBS] || {};
            
            cachedJobs[url] = cacheEntry;
            

            const cacheKeys = Object.keys(cachedJobs);
            if (cacheKeys.length > this.maxStorageItems.CACHED_JOBS) {

                const sortedEntries = cacheKeys
                    .map(key => ({ key, entry: cachedJobs[key] }))
                    .sort((a, b) => new Date(b.entry.cachedAt) - new Date(a.entry.cachedAt));
                
                const keepEntries = sortedEntries.slice(0, this.maxStorageItems.CACHED_JOBS);
                const newCachedJobs = {};
                keepEntries.forEach(({ key, entry }) => {
                    newCachedJobs[key] = entry;
                });
                
                await chrome.storage.local.set({
                    [this.storageKeys.CACHED_JOBS]: newCachedJobs
                });
            } else {
                await chrome.storage.local.set({
                    [this.storageKeys.CACHED_JOBS]: cachedJobs
                });
            }
            
            console.log('Job data cached for:', url);
        } catch (error) {
            console.error('Error caching job data:', error);
        }
    }
    
    async getCachedJobData(url, maxAgeHours = 24) {
        try {
            const result = await chrome.storage.local.get([this.storageKeys.CACHED_JOBS]);
            const cachedJobs = result[this.storageKeys.CACHED_JOBS] || {};
            
            const cacheEntry = cachedJobs[url];
            if (!cacheEntry) return null;
            

            const cacheAge = new Date() - new Date(cacheEntry.cachedAt);
            const maxAge = maxAgeHours * 60 * 60 * 1000;
            
            if (cacheAge > maxAge) {
                console.log('Cache expired for:', url);
                return null;
            }
            
            console.log('Cache hit for:', url);
            return cacheEntry.data;
        } catch (error) {
            console.error('Error getting cached job data:', error);
            return null;
        }
    }
    



    
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
    
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; 
        }
        return hash.toString();
    }
    



    
    async getStorageStats() {
        try {
            const localData = await chrome.storage.local.get(null);
            const syncData = await chrome.storage.sync.get(null);
            
            const calculateSize = (obj) => {
                return new Blob([JSON.stringify(obj)]).size;
            };
            
            const stats = {
                local: {
                    itemCount: Object.keys(localData).length,
                    estimatedSize: calculateSize(localData),
                    items: {}
                },
                sync: {
                    itemCount: Object.keys(syncData).length,
                    estimatedSize: calculateSize(syncData),
                    items: {}
                }
            };
            

            Object.entries(localData).forEach(([key, value]) => {
                stats.local.items[key] = calculateSize(value);
            });
            
            Object.entries(syncData).forEach(([key, value]) => {
                stats.sync.items[key] = calculateSize(value);
            });
            
            return stats;
        } catch (error) {
            console.error('Error getting storage stats:', error);
            return null;
        }
    }
    
    async clearAllData() {
        try {
            await chrome.storage.local.clear();
            await chrome.storage.sync.clear();
            console.log('All storage data cleared');
        } catch (error) {
            console.error('Error clearing storage data:', error);
            throw error;
        }
    }
}


window.StorageManager = StorageManager; 