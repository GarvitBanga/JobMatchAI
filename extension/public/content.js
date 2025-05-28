

class JobExtractor {
  constructor() {
              this.apiEndpoint = 'https://jobmatch-production.up.railway.app/api/v1';
      this.maxJobsToFetch = 10;
      this.fetchTimeout = 10000000;
  }

  async waitForAmazonContent() {
      const maxWaitTime = 15000;
      const checkInterval = 500;
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
          const readMoreLinks = document.querySelectorAll('a.read-more[href*="/en/jobs/"]');
          const jobLinks = document.querySelectorAll('a[href*="/en/jobs/"]');
          
          if (readMoreLinks.length > 0) {
              return true;
          }
          
          if (jobLinks.length > 0) {
              return true;
          }
          
          const bodyText = document.body.textContent.toLowerCase();
          const hasJobContent = bodyText.includes('software engineer') || 
                               bodyText.includes('apply now') ||
                               bodyText.includes('job id');
          
          if (hasJobContent && document.querySelectorAll('a[href*="job"]').length > 5) {
              return true;
          }
          
          await new Promise(resolve => setTimeout(resolve, checkInterval));
      }
      
      return false;
  }

  async waitForDynamicContent() {
      const maxWaitTime = 12000;
      const checkInterval = 1000;
      const startTime = Date.now();
      
      let previousJobCount = 0;
      let stableCount = 0;
      
      while (Date.now() - startTime < maxWaitTime) {
          const currentJobCount = this.countJobElements();
          
          if (currentJobCount === previousJobCount && currentJobCount > 0) {
              stableCount++;
              if (stableCount >= 2) {
                  return true;
              }
          } else {
              stableCount = 0;
          }
          
          previousJobCount = currentJobCount;
          
          await new Promise(resolve => setTimeout(resolve, checkInterval));
      }
      
      return previousJobCount > 0;
  }

  countJobElements() {
      const selectors = [
          'a[href*="job"]',
          'a[href*="career"]',
          'a[href*="position"]',
          '.job', '.job-item', '.job-listing', '.job-card',
          '.position', '.career', '.opening',
          'a[href*="ashby_jid"]',
          'a[href*="greenhouse"]',
          'a[href*="lever.co"]',
          'a[href*="workday"]',
          'a[href*="bamboohr"]',
          'a[href*="smartrecruiters"]',
          'a[href*="deutsche-bank"]',
          '.job-title', '.position-title',
          '[data-job-id]', '[data-position-id]'
      ];
      
      let totalCount = 0;
      for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          totalCount += elements.length;
      }
      
      return totalCount;
  }

  async extractJobListings() {
      const jobs = [];
      
      const currentUrl = window.location.href.toLowerCase();
      
      if (currentUrl.includes('amazon.jobs')) {
          await this.waitForAmazonContent();
      } else {
          await this.waitForDynamicContent();
      }
      
      const jobLinks = await this.findJobLinks();
      
      if (jobLinks.length > 0) {
          const limitedLinks = jobLinks.slice(0, this.maxJobsToFetch);
          
          for (const link of limitedLinks) {
              try {
                  const fullJob = await this.fetchJobDetails(link);
                  if (fullJob && fullJob.title) {
                      jobs.push(fullJob);
                  }
              } catch (error) {
                  console.error('Error fetching job details:', error);
                  
                  const basicJob = this.extractJobFromLink(link);
                  if (basicJob && basicJob.title) {
                      jobs.push(basicJob);
                  }
              }
          }
      }
      
      if (jobs.length === 0) {
          return this.extractJobListingsBasic();
      }
      
      return jobs;
  }

  async fetchJobDetails(jobLink) {
      try {
          if (jobLink.url.startsWith(window.location.origin)) {
              return await this.fetchDirectly(jobLink);
          } 
          else {
              return await this.fetchViaBackend(jobLink);
          }
      } catch (error) {
          console.error('Error in fetchJobDetails:', error);
          return jobLink;
      }
  }

  async fetchDirectly(jobLink) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeout);
      
      try {
          const response = await fetch(jobLink.url, {
              signal: controller.signal,
              headers: {
                  'User-Agent': 'Mozilla/5.0 (compatible; JobScanner/1.0)'
              }
          });
          
          if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const html = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          
          return this.extractFullJobFromPage(doc, jobLink);
          
      } finally {
          clearTimeout(timeoutId);
      }
  }

  async fetchViaBackend(jobLink) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeout);
      
      try {
          const response = await fetch(`${this.apiEndpoint}/fetch/job`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                  job_url: jobLink.url,
                  user_id: 'chrome-extension-user',
                  include_full_content: true,
                  extraction_method: 'standard'
              }),
              signal: controller.signal
          });
          
          if (!response.ok) {
              throw new Error(`Backend API error: ${response.status}`);
          }
          
          const result = await response.json();
          
          if (result.success && result.job) {
              return {
                  ...jobLink,
                  title: result.job.title || jobLink.title,
                  company: result.job.company || jobLink.company,
                  location: result.job.location || jobLink.location,
                  description: result.job.description || 'Description fetched via backend',
                  requirements: result.job.requirements || [],
                  qualifications: result.job.qualifications || [],
                  benefits: result.job.benefits || [],
                  salary: result.job.salary || '',
                  jobType: result.job.job_type || '',
                  extractionMethod: 'backend-api',
                  fetchedAt: new Date().toISOString()
              };
          } else {
              throw new Error(result.error || 'Backend extraction failed');
          }
          
      } catch (error) {
          console.error('Backend fetch failed:', error);
          
          return {
              ...jobLink,
              description: `Job details could not be fetched (${error.message})`,
              requirements: [],
              extractionMethod: 'fallback',
              fetchError: error.message
          };
          
      } finally {
          clearTimeout(timeoutId);
      }
  }


  async findJobLinks() {
      const jobLinks = [];
      

      const isAmazonJobs = window.location.hostname.includes('amazon.jobs') || 
                          window.location.href.includes('amazon.jobs');
      
      if (isAmazonJobs) {
          await this.waitForAmazonContent();
      }
      
      const siteSpecificSelectors = {
          amazon: [
              'a.read-more[href*="/en/jobs/"]',
              'a[href*="/en/jobs/"]',
              'a[href*="/jobs/"]',
              '.job-tile a',
              '.result-item a',
              '[data-test="job-title"] a',
              '.job-result a',
              '.search-result a[href*="job"]',
              'a[href*="Job-"]',
              'a[data-test*="job"]',
              '.JobTile a',
              '[data-testid="job-link"] a',
              '.job-listing a',
              '.position-link a'
          ],
          
          workday: [
              'a[href*="myworkdayjobs.com"]',
              'a[data-automation-id*="jobTitle"]',
              '.css-1qx8o17 a',
              '[data-automation-id="jobTitle"] a'
          ],
          
          greenhouse: [
              'a[href*="greenhouse.io"]',
              'a[href*="grnh.se"]',
              '.opening a',
              '.job-post a'
          ],
          
          lever: [
              'a[href*="jobs.lever.co"]',
              '.posting a',
              '.posting-title a'
          ],
          
          bamboohr: [
              'a[href*="bamboohr.com"]',
              '.BH-JobBoard-Item a'
          ],
          
          generic: [
              'a[href*="/job/"]',
              'a[href*="/jobs/"]',
              'a[href*="/position/"]',
              'a[href*="/career/"]',
              'a[href*="/opening/"]',
              '.job-item a',
              '.job-listing a',
              '.position a',
              '.career-item a'
          ]
      };
      
      const currentDomain = window.location.hostname.toLowerCase();
      let selectorsToUse = siteSpecificSelectors.generic;
      
      if (currentDomain.includes('amazon.jobs') || currentDomain.includes('amazon') && window.location.pathname.includes('/jobs')) {
          selectorsToUse = [...siteSpecificSelectors.amazon, ...siteSpecificSelectors.generic];
      } else if (currentDomain.includes('workday')) {
          selectorsToUse = [...siteSpecificSelectors.workday, ...siteSpecificSelectors.generic];
      } else if (currentDomain.includes('greenhouse')) {
          selectorsToUse = [...siteSpecificSelectors.greenhouse, ...siteSpecificSelectors.generic];
      } else if (currentDomain.includes('lever')) {
          selectorsToUse = [...siteSpecificSelectors.lever, ...siteSpecificSelectors.generic];
      } else if (currentDomain.includes('bamboo')) {
          selectorsToUse = [...siteSpecificSelectors.bamboohr, ...siteSpecificSelectors.generic];
      }
      
      selectorsToUse.forEach(selector => {
          try {
              const elements = document.querySelectorAll(selector);
              
              elements.forEach(element => {
                  const href = element.href;
                  if (href && !jobLinks.find(link => link.url === href)) {
                      const jobInfo = this.extractJobFromLink(element);
                      if (jobInfo.title) {
                          jobLinks.push({
                              url: href,
                              title: jobInfo.title,
                              company: jobInfo.company,
                              location: jobInfo.location,
                              element: element,
                              selector: selector
                          });
                      }
                  }
              });
          } catch (error) {
              console.warn(`Error with selector "${selector}":`, error);
          }
      });
      return jobLinks;
  }

  extractJobFromLink(linkElement) {
      const job = {
          title: '',
          company: '',
          location: '',
          url: linkElement.href || linkElement.url
      };
      
      const jobCard = linkElement.closest('.job-tile') || 
                     linkElement.closest('.job-item') || 
                     linkElement.closest('.job-listing') ||
                     linkElement.closest('[data-automation-id*="job"]') ||
                     linkElement.closest('.opening') ||
                     linkElement.closest('.posting') ||
                     linkElement.closest('.BH-JobBoard-Item') ||
                     linkElement.parentElement;
      
      if (jobCard) {
          const titleSelectors = [
              'h1', 'h2', 'h3', 'h4',
              '.title', '.job-title', '.position-title',
              '[data-automation-id*="title"]',
              '.posting-title',
              '.opening-title'
          ];
          
          for (const selector of titleSelectors) {
              const titleEl = jobCard.querySelector(selector) || linkElement.querySelector(selector);
              if (titleEl && titleEl.textContent.trim()) {
                  job.title = titleEl.textContent.trim();
                  break;
              }
          }
          
          if (!job.title) {
              job.title = linkElement.textContent.trim() || linkElement.title || 'Job Position';
          }
          
          const companySelectors = [
              '.company', '.company-name', '.employer',
              '[data-automation-id*="company"]',
              '.posting-company'
          ];
          
          for (const selector of companySelectors) {
              const companyEl = jobCard.querySelector(selector);
              if (companyEl && companyEl.textContent.trim()) {
                  job.company = companyEl.textContent.trim();
                  break;
              }
          }
          
          if (!job.company) {
              job.company = document.title.split(' - ')[0] || 
                           window.location.hostname.replace('www.', '').split('.')[0] ||
                           'Company';
          }
          
          const locationSelectors = [
              '.location', '.job-location', '.city',
              '[data-automation-id*="location"]',
              '.posting-location'
          ];
          
          for (const selector of locationSelectors) {
              const locationEl = jobCard.querySelector(selector);
              if (locationEl && locationEl.textContent.trim()) {
                  job.location = locationEl.textContent.trim();
                  break;
              }
          }
      }
      
      return job;
  }


  extractFullJobFromPage(doc, basicJob) {
      const job = { ...basicJob };
      
      try {
    
          

          if (job.url.includes('myworkdayjobs.com') || job.url.includes('workday')) {
              job.description = this.extractWorkdayJob(doc);
          }

          else if (job.url.includes('greenhouse.io') || job.url.includes('grnh.se')) {
              job.description = this.extractGreenhouseJob(doc);
          }

          else if (job.url.includes('jobs.lever.co')) {
              job.description = this.extractLeverJob(doc);
          }

          else if (job.url.includes('bamboohr.com')) {
              job.description = this.extractBambooHRJob(doc);
          }

          else {
              job.description = this.extractGenericJob(doc);
          }
          
      } catch (error) {
          console.error('Error extracting job details:', error);
          job.description = 'Error extracting job description';
      }
      
      return job;
  }


  extractWorkdayJob(doc) {
      const contentSelectors = [
          '[data-automation-id="jobPostingDescription"]',
          '.jobDescription',
          '.Job_Description',
          '.wd-text'
      ];
      
      for (const selector of contentSelectors) {
          const element = doc.querySelector(selector);
          if (element) {
              return element.textContent.trim().substring(0, 2000);
          }
      }
      
      return 'Workday job description (detailed extraction in progress)';
  }


  extractGreenhouseJob(doc) {
      const contentSelectors = [
          '.job-post-content',
          '.content',
          '.job-description'
      ];
      
      for (const selector of contentSelectors) {
          const element = doc.querySelector(selector);
          if (element) {
              return element.textContent.trim().substring(0, 2000);
          }
      }
      
      return 'Greenhouse job description (detailed extraction in progress)';
  }


  extractLeverJob(doc) {
      const contentSelectors = [
          '.posting-content',
          '.section-wrapper',
          '.posting-description'
      ];
      
      for (const selector of contentSelectors) {
          const element = doc.querySelector(selector);
          if (element) {
              return element.textContent.trim().substring(0, 2000);
          }
      }
      
      return 'Lever job description (detailed extraction in progress)';
  }


  extractBambooHRJob(doc) {
      const contentSelectors = [
          '.BH-Job-Description',
          '.job-description',
          '.content'
      ];
      
      for (const selector of contentSelectors) {
          const element = doc.querySelector(selector);
          if (element) {
              return element.textContent.trim().substring(0, 2000);
          }
      }
      
      return 'BambooHR job description (detailed extraction in progress)';
  }


  extractGenericJob(doc) {
      const contentSelectors = [
          '.job-description',
          '.description',
          '.content',
          '.job-content',
          'main',
          '.main-content',
          '#content'
      ];
      
      for (const selector of contentSelectors) {
          const element = doc.querySelector(selector);
          if (element) {

              const scripts = element.querySelectorAll('script, style, nav, footer');
              scripts.forEach(el => el.remove());
              
              return element.textContent.trim().substring(0, 2000);
          }
      }
      
      return 'Job description available (extraction in progress)';
  }


  extractJobListingsBasic() {
  const jobs = [];
  
  const jobSelectors = [
    '[data-testid*="job"]',
    '.job-item',
    '.job-listing',
    '.position',
    '.opening',
          '.career-opportunity'
  ];
  
  jobSelectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    elements.forEach(element => {
              const job = this.extractJobFromElement(element);
      if (job && job.title) {
        jobs.push(job);
      }
    });
  });
  
      return jobs.filter((job, index, self) => 
    index === self.findIndex(j => j.title === job.title && j.company === job.company)
  );
}

  extractJobFromElement(element) {
  try {
    const job = {
      title: '',
      company: '',
      location: '',
      url: '',
      description: '',
      requirements: []
    };
    

    const titleSelectors = [
      'h1', 'h2', 'h3', 'h4',
      '.job-title', '.position-title', '.title',
      '[data-testid*="title"]'
    ];
    
    for (const selector of titleSelectors) {
      const titleEl = element.querySelector(selector) || element.closest('a')?.querySelector(selector);
      if (titleEl && titleEl.textContent.trim()) {
        job.title = titleEl.textContent.trim();
        break;
      }
    }
    

    const companySelectors = [
      '.company', '.company-name', '.employer',
      '[data-testid*="company"]'
    ];
    
    for (const selector of companySelectors) {
      const companyEl = element.querySelector(selector);
      if (companyEl && companyEl.textContent.trim()) {
        job.company = companyEl.textContent.trim();
        break;
      }
    }
    
    if (!job.company) {
      job.company = document.title.split(' - ')[0] || window.location.hostname;
    }
    

    const locationSelectors = [
      '.location', '.job-location', '.city',
      '[data-testid*="location"]'
    ];
    
    for (const selector of locationSelectors) {
      const locationEl = element.querySelector(selector);
      if (locationEl && locationEl.textContent.trim()) {
        job.location = locationEl.textContent.trim();
        break;
      }
    }
    

    const linkEl = element.closest('a') || element.querySelector('a');
    if (linkEl && linkEl.href) {
      job.url = linkEl.href;
    } else {
      job.url = window.location.href;
    }
    

    const descEl = element.querySelector('.description, .summary, .excerpt');
    if (descEl) {
      job.description = descEl.textContent.trim().substring(0, 200);
    }
    
    return job;
  } catch (error) {
    console.error('Error extracting job from element:', error);
    return null;
  }
}
}

async function extractPageContent() {
  
  const extractor = new JobExtractor();
  
  const content = {
    title: document.title,
    url: window.location.href,
    text: '',
          jobElements: [],
    jobLinks: [],
    jobs: []
  };
  
      try {
        const jobs = await extractor.extractJobListings();
        content.jobs = jobs;
        
        content.jobElements = jobs.map((job, index) => ({
            id: `job-${index}`,
            title: job.title,
            company: job.company,
            location: job.location,
            description: job.description,
            text: `${job.title} at ${job.company}`,
            html: `<div>${job.title}</div>`,
            selector: 'job-extraction',
            url: job.url
        }));
        
    } catch (error) {
        console.error('Job extraction failed, falling back to basic:', error);
        
        const basicJobs = extractor.extractJobListingsBasic();
        content.jobElements = basicJobs.map((job, index) => ({
            id: `basic-${index}`,
            title: job.title,
            company: job.company,
            location: job.location,
            description: job.description || 'Basic job extraction',
            text: `${job.title} at ${job.company}`,
            html: `<div>${job.title}</div>`,
            selector: 'basic-extraction',
            url: job.url
        }));
    }
  

  const mainContent = document.querySelector('main') || 
                     document.querySelector('.main') ||
                     document.querySelector('#main') ||
                     document.body;
  
  if (mainContent) {
    const scripts = mainContent.querySelectorAll('script, style, nav, footer, .nav, .footer');
    scripts.forEach(el => el.remove());
      content.text = mainContent.textContent.trim().substring(0, 5000);
  }
  
  console.log('Extracted', content.jobs?.length || 0, 'jobs');
  
  return content;
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);
  
  switch (message.type) {
    case 'EXTRACT_CONTENT':
          extractPageContent().then(content => {
      sendResponse(content);
          }).catch(error => {
              console.error('Error in EXTRACT_CONTENT:', error);
              sendResponse({ error: error.message });
          });
          return true; 
      
    case 'EXTRACT_JOBS':
          const extractor = new JobExtractor();
          extractor.extractJobListings().then(jobs => {
      sendResponse({ jobs });
          }).catch(error => {
              console.error('Error in EXTRACT_JOBS:', error);
              sendResponse({ jobs: [], error: error.message });
          });
          return true;
      
    case 'PING':
          sendResponse({ status: 'ready' });
      break;
      
    default:
          console.log(' Unknown message type:', message.type);
  }
});



console.log('Content script initialization complete'); 