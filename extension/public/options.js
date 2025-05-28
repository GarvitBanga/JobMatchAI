

document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    setupEventListeners();
});
    
function setupEventListeners() {

    document.getElementById('settingsForm').addEventListener('submit', saveSettings);
    

    document.getElementById('resetBtn').addEventListener('click', resetSettings);
    

    document.getElementById('testConnectionBtn').addEventListener('click', testConnection);
    

    document.getElementById('resumeFile').addEventListener('change', handleResumeUpload);
}

async function loadSettings() {
    try {
        const settings = await chrome.storage.sync.get([
            'matchThreshold', 
            'resumeData',
            'resumeFileName',
            'resumeUploadDate',
            'resumeProcessingMethod'
        ]);
        

        document.getElementById('matchThreshold').value = settings.matchThreshold || 70;
        

        if (settings.resumeData) {
            showResumeInfo(settings.resumeFileName, settings.resumeUploadDate, settings.resumeProcessingMethod);
            

            if (settings.resumeData.career_insights) {
                showCareerInsights(settings.resumeData.career_insights);
            }
        }
        
    } catch (error) {
        console.error('Error loading settings:', error);
        showStatus('Error loading settings', 'error');
    }
}

async function saveSettings(event) {
    event.preventDefault();
    
    try {
        const settings = {
            matchThreshold: parseInt(document.getElementById('matchThreshold').value)
        };
        
        await chrome.storage.sync.set(settings);
        showStatus('Settings saved successfully!', 'success');
        
    } catch (error) {
        console.error('Error saving settings:', error);
        showStatus('Error saving settings', 'error');
    }
}

async function resetSettings() {
    try {
        await chrome.storage.sync.clear();
        

        document.getElementById('matchThreshold').value = 70;
        document.getElementById('resumeFile').value = '';
        

        hideResumeInfo();
        hideCareerInsights();
        
        showStatus('Settings reset to defaults', 'success');
        
    } catch (error) {
        console.error('Error resetting settings:', error);
        showStatus('Error resetting settings', 'error');
    }
}

async function testConnection() {
    try {
        const apiEndpoint = 'https://jobmatch-production.up.railway.app/api/v1';
        const apiKey = 'ext_jobmatch_secure_key_2024';
        
        showStatus('Testing connection...', 'info');
        
        const baseUrl = apiEndpoint.replace('/api/v1', '');
        const response = await fetch(`${baseUrl}/health`, {
            headers: {
                'X-JobMatch-API-Key': apiKey,
                'X-Extension-ID': chrome.runtime.id
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            showStatus(
                `Connection successful! Features: Resume Processing: ${data.features.resume_processing}, LLM Matching: ${data.features.llm_matching}`, 
                'success'
            );
        } else {
            showStatus(`Connection failed: ${response.status}`, 'error');
        }
        
    } catch (error) {
        console.error('Connection test failed:', error);
        showStatus(`Connection failed: ${error.message}`, 'error');
    }
}

async function handleResumeUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        showStatus('Processing resume...', 'info');
        

        const allowedTypes = ['.pdf', '.doc', '.docx', '.txt'];
        const fileExt = '.' + file.name.split('.').pop().toLowerCase();
        
        if (!allowedTypes.includes(fileExt)) {
            throw new Error(`Unsupported file type. Allowed: ${allowedTypes.join(', ')}`);
        }
        
        const apiEndpoint = 'https://jobmatch-production.up.railway.app/api/v1';
        const apiKey = 'ext_jobmatch_secure_key_2024'; 
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('user_id', 'chrome-extension-user');
        
        const response = await fetch(`${apiEndpoint}/upload/resume`, {
            method: 'POST',
            headers: {
                'X-JobMatch-API-Key': apiKey,
                'X-Extension-ID': chrome.runtime.id
            },
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`Upload failed: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            await chrome.storage.sync.set({
                resumeData: result.structured_data,
                resumeFileName: file.name,
                resumeUploadDate: new Date().toISOString(),
                resumeProcessingMethod: result.processing_method
            });
            
            showResumeInfo(file.name, new Date().toISOString(), result.processing_method);
            
            const insightsMessage = result.insights_generated ? 
                'with career insights' : 'basic processing';
            
            showStatus(
                `Resume processed successfully (${insightsMessage})`, 
                'success'
            );
            
            showResumePreview(result.structured_data);
            
            if (result.structured_data.career_insights) {
                showCareerInsights(result.structured_data.career_insights);
            }
            
        } else {
            throw new Error(result.error || 'Resume processing failed');
        }
        
    } catch (error) {
        console.error('Resume upload failed:', error);
        showStatus(`Resume upload failed: ${error.message}`, 'error');
    }
}

function showResumeInfo(fileName, uploadDate, processingMethod) {
    const container = document.querySelector('.form-group:has(#resumeFile)');
    
    const existingInfo = container.querySelector('.resume-info');
    if (existingInfo) {
        existingInfo.remove();
    }
    
    const resumeInfo = document.createElement('div');
    resumeInfo.className = 'resume-info';
    resumeInfo.style.cssText = `
        margin-top: 10px;
        padding: 10px;
        background-color: #f0f9ff;
        border: 1px solid #bae6fd;
        border-radius: 6px;
        font-size: 14px;
    `;
    
    const uploadDateFormatted = new Date(uploadDate).toLocaleDateString();
    const methodBadge = processingMethod === 'llm_enhanced' ? 
        '<span style="background: #10b981; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px;">Enhanced</span>' :
        '<span style="background: #6b7280; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px;">Basic</span>';
    
    resumeInfo.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <strong>Current Resume:</strong> ${fileName} ${methodBadge}<br>
                <small style="color: #6b7280;">Uploaded: ${uploadDateFormatted}</small>
            </div>
            <button type="button" id="removeResumeBtn" style="
                background: #ef4444; 
                color: white; 
                border: none; 
                padding: 4px 8px; 
                border-radius: 4px; 
                font-size: 12px;
                cursor: pointer;
                margin-left: 10px;
            ">Remove</button>
        </div>
    `;
    
    container.appendChild(resumeInfo);
    
    document.getElementById('removeResumeBtn').addEventListener('click', removeResume);
}

function showCareerInsights(insights) {
    hideCareerInsights();
    
    const container = document.querySelector('.container');
    
    const insightsContainer = document.createElement('div');
    insightsContainer.id = 'careerInsights';
    insightsContainer.style.cssText = `
        margin-top: 30px;
        padding: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border-radius: 12px;
        box-shadow: 0 8px 25px rgba(0,0,0,0.15);
    `;
    

    const careerLevel = insights.career_level || {};
    const currentLevel = careerLevel.current_level || 'Unknown';
    const experience = careerLevel.years_experience || 'Unknown';
    

    const profiles = insights.recommended_job_profiles || [];
    const profilesHTML = profiles.slice(0, 3).map(profile => `
        <div style="background: rgba(255,255,255,0.15); padding: 12px; border-radius: 8px; margin: 8px 0;">
            <strong>${profile.title}</strong> 
            <span style="background: rgba(16,185,129,0.8); padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-left: 8px;">
                ${profile.match_percentage}% match
            </span>
            <br>
            <small style="opacity: 0.9;">${profile.reasoning}</small>
        </div>
    `).join('');
    

    const skillAnalysis = insights.skill_analysis || {};
    const strongSkills = skillAnalysis.strong_skills || [];
    const recommendedSkills = skillAnalysis.recommended_skills || [];
    
    const recommendedSkillsHTML = recommendedSkills.slice(0, 4).map(skill => `
        <div style="background: rgba(255,255,255,0.15); padding: 8px 12px; border-radius: 6px; margin: 4px; display: inline-block;">
            <strong>${skill.skill || skill}</strong>
            ${skill.priority ? `<span style="font-size: 11px; opacity: 0.8;"> (${skill.priority} priority)</span>` : ''}
        </div>
    `).join('');
    

    const industries = insights.industry_recommendations || [];
    const industryHTML = industries.slice(0, 2).map(industry => `
        <span style="background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 4px; margin: 4px; display: inline-block; font-size: 13px;">
            ${industry.industry} (${industry.fit_score}% fit)
        </span>
    `).join('');
    

    const salaryInsights = insights.salary_insights || {};
    const estimatedRange = salaryInsights.estimated_range || 'Not available';
    
    insightsContainer.innerHTML = `
        <h2 style="margin-top: 0; display: flex; align-items: center; gap: 10px;">
            Career Insights
            <button type="button" id="hideInsightsBtn" style="
                background: rgba(255,255,255,0.2);
                color: white;
                border: none;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                cursor: pointer;
                margin-left: auto;
            ">Hide</button>
        </h2>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
            <div>
                <h3 style="margin: 0 0 10px 0; color: #fbbf24;">Career Profile</h3>
                <p><strong>Level:</strong> ${currentLevel}</p>
                <p><strong>Experience:</strong> ${experience} years</p>
                <p><strong>Salary Range:</strong> ${estimatedRange}</p>
            </div>
            
            <div>
                <h3 style="margin: 0 0 10px 0; color: #34d399;">Your Strengths</h3>
                <p>${strongSkills.slice(0, 5).join(', ') || 'Analysis in progress'}</p>
                
                <h3 style="margin: 15px 0 10px 0; color: #fbbf24;">Top Industries</h3>
                <div>${industryHTML || 'Analyzing market fit...'}</div>
            </div>
        </div>
        
        <div style="margin-top: 20px;">
            <h3 style="margin: 0 0 10px 0; color: #60a5fa;">Recommended Job Profiles</h3>
            ${profilesHTML || '<p>Generating personalized job recommendations...</p>'}
        </div>
        
        <div style="margin-top: 20px;">
            <h3 style="margin: 0 0 10px 0; color: #f87171;">Skills to Learn</h3>
            <div style="margin-top: 10px;">
                ${recommendedSkillsHTML || '<p>Analyzing skill gaps...</p>'}
            </div>
        </div>
        
        <div style="margin-top: 20px; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 8px; font-size: 13px;">
            <strong>Note:</strong> These insights are generated from analysis of your resume and market trends. 
            Use them to optimize your job search and identify opportunities.
        </div>
    `;
    
    container.appendChild(insightsContainer);
    
    document.getElementById('hideInsightsBtn').addEventListener('click', hideCareerInsights);
}

function hideCareerInsights() {
    const insights = document.getElementById('careerInsights');
    if (insights) {
        insights.remove();
    }
}

function hideResumeInfo() {
    const resumeInfo = document.querySelector('.resume-info');
    if (resumeInfo) {
        resumeInfo.remove();
    }
    hideCareerInsights();
}

async function removeResume() {
    try {
        await chrome.storage.sync.remove([
            'resumeData', 
            'resumeFileName', 
            'resumeUploadDate',
            'resumeProcessingMethod'
        ]);
        
        hideResumeInfo();
        document.getElementById('resumeFile').value = '';
        showStatus('Resume and career insights removed successfully', 'success');
        
    } catch (error) {
        console.error('Error removing resume:', error);
        showStatus('Error removing resume', 'error');
    }
}

function showResumePreview(resumeData) {
    const container = document.querySelector('.container');
    
    const existingPreview = document.getElementById('resumePreview');
    if (existingPreview) {
        existingPreview.remove();
    }
    
    const preview = document.createElement('div');
    preview.id = 'resumePreview';
    preview.style.cssText = `
        margin-top: 20px;
        padding: 20px;
        background-color: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        max-height: 300px;
        overflow-y: auto;
    `;
    
    const skillsText = resumeData.skills ? resumeData.skills.join(', ') : 'None detected';
    const experienceCount = resumeData.experience ? resumeData.experience.length : 0;
    const educationCount = resumeData.education ? resumeData.education.length : 0;
    
    const hasInsights = resumeData.career_insights && Object.keys(resumeData.career_insights).length > 0;
    const insightsIndicator = hasInsights ? 
        '<span style="background: #10b981; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-left: 10px;">Enhanced</span>' :
        '<span style="background: #6b7280; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-left: 10px;">Basic</span>';
    
    preview.innerHTML = `
        <h3 style="margin-top: 0; color: #374151;">
            Resume Preview ${insightsIndicator}
        </h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 14px;">
            <div>
                <strong>Personal Info:</strong><br>
                Name: ${resumeData.personal_info?.name || 'Not detected'}<br>
                Email: ${resumeData.personal_info?.email || 'Not detected'}<br>
                Phone: ${resumeData.personal_info?.phone || 'Not detected'}
            </div>
            <div>
                <strong>Summary:</strong><br>
                ${resumeData.summary || 'No summary detected'}
            </div>
            <div>
                <strong>Skills (${resumeData.skills?.length || 0}):</strong><br>
                ${skillsText}
            </div>
            <div>
                <strong>Experience:</strong><br>
                ${experienceCount} positions found<br>
                <strong>Education:</strong><br>
                ${educationCount} degrees found
            </div>
        </div>
        
        ${hasInsights ? `
            <div style="margin-top: 15px; padding: 10px; background: #ecfdf5; border: 1px solid #d1fae5; border-radius: 6px;">
                <strong style="color: #065f46;">Insights Available:</strong>
                <ul style="margin: 5px 0; padding-left: 20px; color: #047857;">
                    <li>${resumeData.career_insights.recommended_job_profiles?.length || 0} recommended job profiles</li>
                    <li>${resumeData.career_insights.skill_analysis?.recommended_skills?.length || 0} skill recommendations</li>
                    <li>${resumeData.career_insights.industry_recommendations?.length || 0} industry suggestions</li>
                </ul>
            </div>
        ` : `
            <div style="margin-top: 15px; padding: 10px; background: #fef3c7; border: 1px solid #fbbf24; border-radius: 6px;">
                <strong style="color: #92400e;">Note:</strong> Enhanced processing provides additional career insights.
            </div>
        `}
        
        <button type="button" id="closePreviewBtn" style="
            margin-top: 15px;
            background: #6b7280;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
        ">Close Preview</button>
    `;
    
    container.appendChild(preview);
    
    document.getElementById('closePreviewBtn').addEventListener('click', () => {
        preview.remove();
    });
}

function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';
    

    if (type === 'info') {
        status.style.backgroundColor = '#dbeafe';
        status.style.color = '#1e40af';
        status.style.border = '1px solid #93c5fd';
    }
    

    setTimeout(() => {
        status.style.display = 'none';
    }, 5000);
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Options page received message:', message);
    
    switch (message.type) {
        case 'SETTINGS_REQUEST':
            loadSettings();
            break;
            
        default:
            console.log('Unknown message type:', message.type);
    }
});

console.log('Options page loaded'); 