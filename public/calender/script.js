// Global variables
let courseData = [];
let selectedCourses = [];
let currentEditingCourse = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    loadFromLocalStorage();
});

function initializeApp() {
    // Show initial state
    showInitialState();
}

function setupEventListeners() {
    // Load data button
    document.getElementById('loadDataBtn').addEventListener('click', loadCourseData);
    
    // Reset button
    document.getElementById('resetBtn').addEventListener('click', resetApplication);
    
    // Search functionality
    document.getElementById('courseSearch').addEventListener('input', filterCourses);
    document.getElementById('sectionFilter').addEventListener('change', filterCourses);
    document.getElementById('dayFilter').addEventListener('change', filterCourses);
    
    // Export button (now shows export options)
    document.getElementById('exportBtn').addEventListener('click', showExportOptions);
    
    // Modal controls
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('cancelEdit').addEventListener('click', closeModal);
    document.getElementById('courseForm').addEventListener('submit', saveCourseEdit);
    
    // Click outside modal to close
    document.getElementById('courseModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeModal();
        }
    });
}

// Helper functions for new API format
function getDepartmentFromCode(courseCode) {
    if (!courseCode) return 'Unknown';
    
    const prefix = courseCode.replace(/[0-9]/g, '');
    return prefix || 'Unknown';
}

function formatScheduleFromAPI(preRegSchedule) {
    if (!preRegSchedule) return '';
    
    // Convert format like "SUNDAY(8:00 AM-9:20 AM-10B-18C)\nTUESDAY(8:00 AM-9:20 AM-10B-18C)"
    // to old format like "Sunday(08:00 AM-09:20 AM-UB0000),Tuesday(08:00 AM-09:20 AM-UB0000)"
    return preRegSchedule
        .split('\n')
        .map(daySchedule => {
            const match = daySchedule.match(/(\w+)\((.+)\)/);
            if (match) {
                const [, day, timeRoom] = match;
                // Capitalize first letter only
                const formattedDay = day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
                return `${formattedDay}(${timeRoom})`;
            }
            return daySchedule;
        })
        .join(',');
}

async function loadCourseData() {
    showLoading();
    
    try {
        // Fetch main course data
        const response = await fetch('https://usis-cdn.eniamza.com/connect.json');
        const data = await response.json();
        
        // Fetch course titles from the new endpoint
        const titleResponse = await fetch('https://usis-cdn.eniamza.com/usisdump.json');
        const titleData = await titleResponse.json();
        
        console.log('Title data sample:', titleData.slice(0, 3)); // Debug: show first 3 entries
        
        // Create a map of course codes to course titles
        const courseTitleMap = {};
        titleData.forEach(course => {
            if (course.courseCode && course.courseTitle) {
                courseTitleMap[course.courseCode] = course.courseTitle;
            }
        });
        
        console.log('Total course titles mapped:', Object.keys(courseTitleMap).length); // Debug
        console.log('Sample mappings:', Object.entries(courseTitleMap).slice(0, 5)); // Debug
        
        courseData = data.map(course => {
            const mappedTitle = courseTitleMap[course.courseCode];
            
            return {
                id: course.sectionId,
                courseCode: course.courseCode,
                courseTitle: mappedTitle || course.courseCode,
                empName: course.faculties || 'TBA',
                empShortName: course.faculties || 'TBA',
                deptName: getDepartmentFromCode(course.courseCode),
                classSchedule: formatScheduleFromAPI(course.preRegSchedule),
                classLabSchedule: formatScheduleFromAPI(course.preRegLabSchedule || ''),
                courseCredit: course.courseCredit,
                availableSeat: course.capacity - course.consumedSeat,
                totalFillupSeat: course.consumedSeat,
                defaultSeatCapacity: course.capacity,
                courseDetails: `${course.sectionName} - ${course.roomName}`,
                preRequisiteCourses: course.prerequisiteCourses || '',
                dayNo: 0,
                sectionName: course.sectionName,
                roomName: course.roomName,
                academicDegree: course.academicDegree,
                labName: course.labName || null,
                labRoomName: course.labRoomName || null
            };
        });
        
        console.log('Sample processed course:', courseData[0]); // Debug: show first processed course
        
        populateFilters();
        showCourseSelection();
        displayCourses();
        
        // Save to localStorage
        localStorage.setItem('courseData', JSON.stringify(courseData));
        
    } catch (error) {
        console.error('Error loading course data:', error);
        alert('Failed to load course data. Please try again.');
        showInitialState();
    }
}

function populateFilters() {
    populateDayFilter();
    // Section filter will be populated dynamically based on search
    populateSectionFilter([]);
}

function populateSectionFilter(filteredCourses) {
    const sectionFilter = document.getElementById('sectionFilter');
    const sections = [...new Set(filteredCourses.map(course => course.sectionName))].sort();
    
    // Store current selection
    const currentSelection = sectionFilter.value;
    
    sectionFilter.innerHTML = '<option value="">All Sections</option>';
    
    if (sections.length > 0) {
        sections.forEach(section => {
            const option = document.createElement('option');
            option.value = section;
            option.textContent = `Section ${section}`;
            sectionFilter.appendChild(option);
        });
        
        // Restore selection if it still exists
        if (sections.includes(currentSelection)) {
            sectionFilter.value = currentSelection;
        }
    }
}

function populateDayFilter() {
    const dayFilter = document.getElementById('dayFilter');
    const days = new Set();
    
    courseData.forEach(course => {
        if (course.classSchedule) {
            const separator = course.classSchedule.includes('\n') ? '\n' : ',';
            const dayMatches = course.classSchedule.split(separator);
            dayMatches.forEach(daySchedule => {
                const match = daySchedule.match(/(\w+)\(/);
                if (match) {
                    const dayName = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
                    days.add(dayName);
                }
            });
        }
    });
    
    const sortedDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        .filter(day => days.has(day));
    
    dayFilter.innerHTML = '<option value="">All Days</option>';
    sortedDays.forEach(day => {
        const option = document.createElement('option');
        option.value = day;
        option.textContent = day;
        dayFilter.appendChild(option);
    });
}

function filterCourses() {
    const searchTerm = document.getElementById('courseSearch').value.toLowerCase();
    const selectedSection = document.getElementById('sectionFilter').value;
    const selectedDay = document.getElementById('dayFilter').value;
    
    let filteredCourses = courseData;
    
    // First filter by search term (course code or title)
    if (searchTerm) {
        filteredCourses = filteredCourses.filter(course => 
            course.courseCode.toLowerCase().includes(searchTerm) ||
            course.courseTitle.toLowerCase().includes(searchTerm)
        );
    }
    
    // Update section filter based on search results
    // If no search term, show all sections; otherwise show only relevant sections
    populateSectionFilter(searchTerm ? filteredCourses : []);
    
    // Then filter by section
    if (selectedSection) {
        filteredCourses = filteredCourses.filter(course => course.sectionName === selectedSection);
    }
    
    // Finally filter by day
    if (selectedDay) {
        filteredCourses = filteredCourses.filter(course => {
            if (!course.classSchedule) return false;
            const separator = course.classSchedule.includes('\n') ? '\n' : ',';
            const dayMatches = course.classSchedule.split(separator);
            return dayMatches.some(daySchedule => {
                const match = daySchedule.match(/(\w+)\(/);
                if (match) {
                    const dayName = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
                    return dayName === selectedDay;
                }
                return false;
            });
        });
    }
    
    displayCourses(filteredCourses);
}

function displayCourses(courses = courseData) {
    const searchResults = document.getElementById('searchResults');
    searchResults.innerHTML = '';
    
    // Group courses by course code
    const groupedCourses = {};
    courses.forEach(course => {
        if (!groupedCourses[course.courseCode]) {
            groupedCourses[course.courseCode] = [];
        }
        groupedCourses[course.courseCode].push(course);
    });
    
    Object.entries(groupedCourses).forEach(([courseCode, sections]) => {
        const courseCard = createCourseCard(courseCode, sections);
        searchResults.appendChild(courseCard);
    });
}

function createCourseCard(courseCode, sections) {
    const card = document.createElement('div');
    card.className = 'course-card bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 fade-in';
    
    const firstSection = sections[0];
    const scheduleText = parseSchedule(firstSection.classSchedule);
    
    // Get course title - show the actual course title from API
    let courseTitle = firstSection.courseTitle;
    
    card.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-4 space-y-2 sm:space-y-0">
            <div class="flex-1 min-w-0">
                <h3 class="text-lg font-bold text-gray-900 truncate">${courseCode}</h3>
                <p class="text-sm text-gray-600 break-words">${courseTitle}</p>
            </div>
            <span class="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded self-start sm:self-auto shrink-0">
                ${firstSection.courseCredit} Credits
            </span>
        </div>
        
        <div class="space-y-1 sm:space-y-2 mb-4">
            <p class="text-sm text-gray-600 flex items-center">
                <i class="fas fa-users text-blue-600 mr-2 shrink-0"></i>
                <span>${sections.length} section(s) available</span>
            </p>
        </div>
        
        <div class="space-y-2">
            ${sections.map(section => {
                const hasLab = section.labName && section.classLabSchedule;
                const labScheduleText = hasLab ? parseSchedule(section.classLabSchedule) : '';
                
                return `
                <div class="bg-gray-50 rounded-lg p-3">
                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-2 space-y-2 sm:space-y-0">
                        <div class="flex-1 min-w-0">
                            <span class="font-medium text-gray-900 block break-words">Section ${section.sectionName} - ${section.roomName || 'TBA'}</span>
                            <p class="text-sm text-gray-600 break-words">${section.empName}</p>
                        </div>
                        <div class="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
                            <span class="text-xs text-gray-500 text-center sm:text-right">
                                ${section.availableSeat}/${section.defaultSeatCapacity} available
                            </span>
                            <button onclick="addCourse('${section.id}')" 
                                    class="bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700 transition-colors w-full sm:w-auto">
                                Add Course
                            </button>
                        </div>
                    </div>
                    
                    ${hasLab ? `
                    <div class="mt-3 pt-3 border-t border-gray-200">
                        <div class="bg-green-50 rounded p-2">
                            <div class="flex items-center mb-1">
                                <i class="fas fa-flask text-green-600 mr-2 shrink-0"></i>
                                <span class="text-sm font-medium text-green-800 break-words">Lab: ${section.labName}</span>
                            </div>
                            <p class="text-xs text-green-700 break-words">Room: ${section.labRoomName || 'TBA'}</p>
                            <p class="text-xs text-green-700 break-words">Schedule: ${labScheduleText}</p>
                            <button onclick="addLabCourse('${section.id}')" 
                                    class="mt-2 bg-green-600 text-white px-3 py-2 rounded text-xs hover:bg-green-700 transition-colors w-full sm:w-auto">
                                Add Lab
                            </button>
                        </div>
                    </div>
                    ` : ''}
                </div>
            `;
            }).join('')}
        </div>
    `;
    
    return card;
}

function parseSchedule(schedule) {
    if (!schedule) return 'Schedule TBA';
    
    // Parse schedule string like "Sunday(08:00 AM-09:20 AM-UB0000),Tuesday(08:00 AM-09:20 AM-UB0000)"
    // or new format "SUNDAY(8:00 AM-9:20 AM-10B-18C)\nTUESDAY(8:00 AM-9:20 AM-10B-18C)"
    const separator = schedule.includes('\n') ? '\n' : ',';
    const days = schedule.split(separator).map(day => {
        const match = day.match(/(\w+)\((.+)\)/);
        if (match) {
            const dayName = match[1];
            const timeRoom = match[2];
            const timeMatch = timeRoom.match(/(\d{1,2}:\d{2} [AP]M)-(\d{1,2}:\d{2} [AP]M)/);
            if (timeMatch) {
                // Capitalize first letter only for day name
                const formattedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1).toLowerCase();
                return `${formattedDay} ${timeMatch[1]}-${timeMatch[2]}`;
            }
        }
        return day;
    });
    
    return days.join(', ');
}

function extractRoomFromSchedule(schedule) {
    if (!schedule) return 'TBA';
    
    // Extract room number from new schedule format
    // Example: "Sunday(08:00 AM-09:20 AM-10B-18C),Tuesday(08:00 AM-09:20 AM-10B-18C)"
    const match = schedule.match(/-([^,)]+)\)/);
    return match ? match[1] : 'TBA';
}

function addCourse(courseId) {
    const course = courseData.find(c => c.id == courseId);
    if (!course) return;
    
    // Check if regular course is already selected
    if (selectedCourses.find(c => c.id == courseId && !c.isLabOnly)) {
        alert('This course is already selected!');
        return;
    }
    
    // Generate email from faculty short name
    let email = 'instructor@bracu.ac.bd';
    if (course.empShortName && course.empShortName !== 'TBA') {
        email = `${course.empShortName.toLowerCase()}@bracu.ac.bd`;
    }
    
    // Add editable fields to the course (regular class only)
    const editableCourse = {
        ...course,
        editableCourseName: course.courseCode,
        editableCourseTitle: course.courseTitle,
        editableFacultyName: course.empName,
        editableRoomNumber: course.roomName || extractRoomFromSchedule(course.classSchedule),
        editableInstructorEmail: email,
        eventType: 'normal', // Regular class, not lab
        isLabOnly: false
        // Note: using course.classSchedule (not classLabSchedule) for regular classes
    };
    
    selectedCourses.push(editableCourse);
    updateSelectedCoursesDisplay();
    saveToLocalStorage();
    
    // Show success message
    showNotification('Course added successfully', 'success');
}

function addLabCourse(courseId) {
    const course = courseData.find(c => c.id == courseId);
    if (!course) return;
    
    // Check if lab course is already selected
    if (selectedCourses.find(c => c.id == courseId && c.isLabOnly)) {
        alert('This lab is already selected');
        return;
    }
    
    // Generate email from faculty short name
    let email = 'instructor@bracu.ac.bd';
    if (course.empShortName && course.empShortName !== 'TBA') {
        email = `${course.empShortName.toLowerCase()}@bracu.ac.bd`;
    }
    
    // Add editable fields to the lab course
    const editableLabCourse = {
        ...course,
        editableCourseName: course.courseCode + ' Lab',
        editableCourseTitle: course.labName || course.courseTitle + ' Lab',
        editableFacultyName: course.empName,
        editableRoomNumber: course.labRoomName || 'Lab TBA',
        editableInstructorEmail: email,
        eventType: 'lab',
        isLabOnly: true,
        classSchedule: course.classLabSchedule // Use lab schedule instead of regular schedule
    };
    
    selectedCourses.push(editableLabCourse);
    updateSelectedCoursesDisplay();
    saveToLocalStorage();
    
    // Show success message
    showNotification('Lab course added successfully', 'success');
}

function updateSelectedCoursesDisplay() {
    const container = document.getElementById('selectedCoursesList');
    const section = document.getElementById('selectedCourses');
    
    if (selectedCourses.length === 0) {
        section.classList.add('hidden');
        return;
    }
    
    section.classList.remove('hidden');
    container.innerHTML = '';
    
    selectedCourses.forEach((course, index) => {
        const courseElement = createSelectedCourseElement(course, index);
        container.appendChild(courseElement);
    });
}

function createSelectedCourseElement(course, index) {
    const element = document.createElement('div');
    const isLab = course.isLabOnly;
    element.className = `${isLab ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'} rounded-lg p-3 sm:p-4 border`;
    
    const scheduleText = parseSchedule(course.classSchedule);
    const eventTypeIcon = getEventTypeIcon(course.eventType);
    
    element.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start space-y-3 sm:space-y-0">
            <div class="flex-1 min-w-0">
                <div class="flex flex-col sm:flex-row sm:items-center mb-2 space-y-1 sm:space-y-0">
                    <div class="flex items-center">
                        <i class="${eventTypeIcon} ${isLab ? 'text-green-600' : 'text-blue-600'} mr-2 shrink-0"></i>
                        <h4 class="text-lg font-bold text-gray-900 break-words">${course.editableCourseName}</h4>
                    </div>
                    <span class="ml-0 sm:ml-2 px-2 py-1 ${isLab ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'} text-xs rounded capitalize self-start">
                        ${course.eventType}${isLab ? ' Only' : ''}
                    </span>
                </div>
                <p class="text-gray-700 mb-1 break-words">${course.editableCourseTitle}</p>
                <div class="space-y-1">
                    <p class="text-sm text-gray-600 flex items-start">
                        <i class="fas fa-user text-gray-400 mr-2 mt-0.5 shrink-0"></i>
                        <span class="break-words">${course.editableFacultyName}</span>
                    </p>
                    <p class="text-sm text-gray-600 flex items-start">
                        <i class="fas fa-door-open text-gray-400 mr-2 mt-0.5 shrink-0"></i>
                        <span class="break-words">Room: ${course.editableRoomNumber}</span>
                    </p>
                    <p class="text-sm text-gray-600 flex items-start">
                        <i class="fas fa-envelope text-gray-400 mr-2 mt-0.5 shrink-0"></i>
                        <span class="break-words">${course.editableInstructorEmail}</span>
                    </p>
                    <p class="text-sm text-gray-600 flex items-start">
                        <i class="fas fa-clock text-gray-400 mr-2 mt-0.5 shrink-0"></i>
                        <span class="break-words">${scheduleText}</span>
                    </p>
                </div>
            </div>
            <div class="flex flex-row sm:flex-col space-x-2 sm:space-x-0 sm:space-y-2 sm:ml-4 shrink-0">
                <button onclick="editCourse(${index})" 
                        class="text-blue-600 hover:text-blue-800 p-2 rounded border border-blue-200 hover:border-blue-300 transition-colors flex-1 sm:flex-none">
                    <i class="fas fa-edit"></i>
                    <span class="ml-1 sm:hidden">Edit</span>
                </button>
                <button onclick="removeCourse(${index})" 
                        class="text-red-600 hover:text-red-800 p-2 rounded border border-red-200 hover:border-red-300 transition-colors flex-1 sm:flex-none">
                    <i class="fas fa-trash"></i>
                    <span class="ml-1 sm:hidden">Remove</span>
                </button>
            </div>
        </div>
    `;
    
    return element;
}

function getEventTypeIcon(eventType) {
    switch(eventType) {
        case 'lab': return 'fas fa-flask';
        case 'exam': return 'fas fa-clipboard-check';
        default: return 'fas fa-chalkboard-teacher';
    }
}

function editCourse(index) {
    currentEditingCourse = index;
    const course = selectedCourses[index];
    
    // Populate modal form
    document.getElementById('editCourseName').value = course.editableCourseName;
    document.getElementById('editCourseTitle').value = course.editableCourseTitle;
    document.getElementById('editFacultyName').value = course.editableFacultyName;
    document.getElementById('editRoomNumber').value = course.editableRoomNumber;
    document.getElementById('editInstructorEmail').value = course.editableInstructorEmail;
    document.getElementById('editEventType').value = course.eventType;
    
    // Show modal
    document.getElementById('courseModal').classList.remove('hidden');
    document.getElementById('courseModal').classList.add('flex');
}

function saveCourseEdit(e) {
    e.preventDefault();
    
    if (currentEditingCourse === null) return;
    
    const course = selectedCourses[currentEditingCourse];
    course.editableCourseName = document.getElementById('editCourseName').value;
    course.editableCourseTitle = document.getElementById('editCourseTitle').value;
    course.editableFacultyName = document.getElementById('editFacultyName').value;
    course.editableRoomNumber = document.getElementById('editRoomNumber').value;
    course.editableInstructorEmail = document.getElementById('editInstructorEmail').value;
    course.eventType = document.getElementById('editEventType').value;
    
    updateSelectedCoursesDisplay();
    saveToLocalStorage();
    closeModal();
    
    showNotification('Course updated successfully', 'success');
}

function removeCourse(index) {
    if (confirm('Are you sure you want to remove this course?')) {
        selectedCourses.splice(index, 1);
        updateSelectedCoursesDisplay();
        saveToLocalStorage();
        showNotification('Course removed successfully', 'success');
    }
}

function closeModal() {
    document.getElementById('courseModal').classList.add('hidden');
    document.getElementById('courseModal').classList.remove('flex');
    currentEditingCourse = null;
}

function resetApplication() {
    if (confirm('Are you sure you want to reset everything? This will clear all selected courses.')) {
        selectedCourses = [];
        courseData = [];
        currentEditingCourse = null;
        
        // Clear localStorage
        localStorage.removeItem('selectedCourses');
        localStorage.removeItem('courseData');
        
        // Reset UI
        updateSelectedCoursesDisplay();
        showInitialState();
        
        showNotification('Application reset successfully', 'info');
    }
}

// Calendar Export Functions - No API Key Required

// Export as .ics file (works with Google Calendar, Outlook, Apple Calendar, etc.)
function exportToCalendarFile() {
    if (selectedCourses.length === 0) {
        alert('Please select at least one course to export.');
        return;
    }
    
    const icsContent = generateICSFile();
    downloadICSFile(icsContent, 'BRACU_Schedule.ics');
    
    showNotification('Calendar file downloaded. Import it to your calendar app.', 'success');
    showImportInstructions();
}

// Generate ICS (iCalendar) file content - IMPROVED for bulk import
function generateICSFile() {
    const events = [];
    
    selectedCourses.forEach(course => {
        const courseEvents = parseScheduleForICS(course);
        events.push(...courseEvents);
    });
    
    let icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Routine2Calendar//BRACU Schedule//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:BRACU Schedule',
        'X-WR-TIMEZONE:Asia/Dhaka',
        'X-WR-CALDESC:BRAC University Class Schedule',
        'BEGIN:VTIMEZONE',
        'TZID:Asia/Dhaka',
        'BEGIN:STANDARD',
        'DTSTART:20230101T000000',
        'TZOFFSETFROM:+0600',
        'TZOFFSETTO:+0600',
        'TZNAME:BST',
        'END:STANDARD',
        'END:VTIMEZONE'
    ];
    
    events.forEach(event => {
        icsContent.push(...event);
    });
    
    icsContent.push('END:VCALENDAR');
    
    return icsContent.join('\r\n');
}

// Alternative: Export to Google Calendar via URL (no API needed) - BULK METHOD
function exportToGoogleCalendarURL() {
    if (selectedCourses.length === 0) {
        alert('Please select at least one course to export.');
        return;
    }
    
    // Create individual Google Calendar events for each course schedule
    const googleCalendarURLs = [];
    
    selectedCourses.forEach(course => {
        const events = parseScheduleForGoogleURL(course);
        googleCalendarURLs.push(...events);
    });
    
    // Open multiple Google Calendar "add event" tabs with a delay
    showBulkImportModal(googleCalendarURLs);
}

function showBulkImportModal(googleCalendarURLs) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 class="text-lg font-bold text-gray-900 mb-4">
                <i class="fab fa-google text-blue-600 mr-2"></i>Import to Google Calendar
            </h3>
            <p class="text-gray-600 mb-4">Ready to import ${googleCalendarURLs.length} events to Google Calendar.</p>
            
            <div class="bg-yellow-50 p-3 rounded-lg border border-yellow-200 mb-4">
                <p class="text-xs text-yellow-700">
                    <i class="fas fa-info-circle mr-1"></i>
                    This will open ${googleCalendarURLs.length} tabs (one for each class session). Your browser may ask to allow popups.
                </p>
            </div>
            
            <div class="space-y-3">
                <button onclick="openAllGoogleCalendarTabs(${JSON.stringify(googleCalendarURLs).replace(/"/g, '&quot;')}); document.body.removeChild(this.closest('.fixed'))" 
                        class="w-full bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 transition-colors">
                    <i class="fas fa-calendar-plus mr-2"></i>
                    Import All Events (${googleCalendarURLs.length} events)
                </button>
                
                <button onclick="exportToCalendarFile(); document.body.removeChild(this.closest('.fixed'))" 
                        class="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition-colors">
                    <i class="fas fa-download mr-2"></i>
                    Download .ics File Instead (Recommended)
                </button>
            </div>
            
            <button onclick="document.body.removeChild(this.closest('.fixed'))" 
                    class="w-full mt-4 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition-colors">
                Cancel
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function openAllGoogleCalendarTabs(urls) {
    if (!Array.isArray(urls)) {
        console.error('URLs must be an array');
        return;
    }
    
    // Open tabs with a delay to prevent popup blocking
    urls.forEach((url, index) => {
        setTimeout(() => {
            window.open(url, '_blank');
        }, index * 750); // 750ms delay between each tab
    });
    
    showNotification(`Opening ${urls.length} Google Calendar tabs...`, 'info');
}

function createBulkGoogleCalendarEvent() {
    // Create a single comprehensive event with all course schedules
    const allSchedules = selectedCourses.map(course => {
        const scheduleText = parseSchedule(course.classSchedule);
        return `${course.editableCourseName} (${course.eventType}): ${scheduleText} - Room: ${course.editableRoomNumber} - ${course.editableFacultyName}`;
    }).join('\\n\\n');
    
    const title = `BRACU Schedule - ${selectedCourses.length} Courses`;
    const details = `BRAC University Class Schedule\\n\\n${allSchedules}`;
    const location = 'BRAC University';
    
    // Use next Monday as start date for the semester
    const today = new Date();
    const nextMonday = getNextDayOccurrence(today, 1); // 1 = Monday
    
    // Set to 8:00 AM
    nextMonday.setHours(8, 0, 0, 0);
    const endTime = new Date(nextMonday);
    endTime.setHours(17, 0, 0, 0); // 5:00 PM
    
    const startFormatted = formatDateForGoogle(nextMonday);
    const endFormatted = formatDateForGoogle(endTime);
    
    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: title,
        dates: `${startFormatted}/${endFormatted}`,
        details: details,
        location: location,
        recur: 'RRULE:FREQ=WEEKLY;COUNT=15' // 15 weeks semester
    });
    
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Better approach: Create a shareable calendar URL or use calendar subscription
function createShareableCalendar() {
    if (selectedCourses.length === 0) {
        alert('Please select at least one course to export.');
        return;
    }
    
    // Generate a unique calendar feed URL (would need backend implementation)
    const scheduleId = generateScheduleId();
    
    // Create individual Google Calendar events for better import
    const googleCalendarURLs = [];
    
    selectedCourses.forEach(course => {
        const events = parseScheduleForGoogleURL(course);
        googleCalendarURLs.push(...events);
    });
    
    showShareableOptions(googleCalendarURLs, scheduleId);
}

function generateScheduleId() {
    // Generate a unique ID based on selected courses
    const courseIds = selectedCourses.map(c => c.id).sort().join(',');
    return btoa(courseIds).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
}

function showShareableOptions(googleCalendarURLs, scheduleId) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h3 class="text-lg font-bold text-gray-900 mb-4">
                <i class="fas fa-share-alt text-blue-600 mr-2"></i>Share Your Schedule
            </h3>
            
            <div class="space-y-4">
                <div class="bg-blue-50 p-4 rounded-lg">
                    <h4 class="font-semibold text-blue-900 mb-2">📅 Google Calendar Import</h4>
                    <p class="text-sm text-blue-700 mb-3">Import all ${googleCalendarURLs.length} events to Google Calendar:</p>
                    <button onclick="openAllGoogleCalendarTabs(${JSON.stringify(googleCalendarURLs).replace(/"/g, '&quot;')}); document.body.removeChild(this.closest('.fixed'))" 
                            class="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors">
                        <i class="fab fa-google mr-2"></i>Import ${googleCalendarURLs.length} Events
                    </button>
                </div>
                
                <div class="bg-green-50 p-4 rounded-lg">
                    <h4 class="font-semibold text-green-900 mb-2">📱 Calendar File (.ics)</h4>
                    <p class="text-sm text-green-700 mb-3">Download and import to any calendar app (Recommended):</p>
                    <button onclick="exportToCalendarFile(); document.body.removeChild(this.closest('.fixed'))" 
                            class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors">
                        <i class="fas fa-download mr-2"></i>Download .ics File
                    </button>
                </div>
                
                <div class="bg-purple-50 p-4 rounded-lg">
                    <h4 class="font-semibold text-purple-900 mb-2">🔗 Share with Friends</h4>
                    <p class="text-sm text-purple-700 mb-3">Schedule ID: <code class="bg-white px-2 py-1 rounded">${scheduleId}</code></p>
                    <button onclick="copyShareableLink('${scheduleId}')" 
                            class="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition-colors">
                        <i class="fas fa-copy mr-2"></i>Copy Shareable Link
                    </button>
                </div>
                
                <div class="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                    <p class="text-xs text-yellow-700">
                        <i class="fas fa-lightbulb mr-1"></i>
                        <strong>Note:</strong> Google Calendar import opens multiple tabs. For easier import, use the .ics file method.
                    </p>
                </div>
            </div>
            
            <button onclick="document.body.removeChild(this.closest('.fixed'))" 
                    class="w-full mt-6 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition-colors">
                Close
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function copyShareableLink(scheduleId) {
    const currentUrl = window.location.href.split('?')[0];
    const shareableLink = `${currentUrl}?schedule=${scheduleId}`;
    
    navigator.clipboard.writeText(shareableLink).then(() => {
        showNotification('Shareable link copied to clipboard', 'success');
    }).catch(err => {
        console.error('Failed to copy: ', err);
        showNotification('Failed to copy link. Schedule ID: ' + scheduleId, 'error');
    });
}

// Export options modal
function showExportOptions() {
    if (selectedCourses.length === 0) {
        alert('Please select at least one course to export.');
        return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 class="text-lg font-bold text-gray-900 mb-4">Export Your Schedule</h3>
            
            <div class="space-y-3">
                <button onclick="exportToCalendarFile(); document.body.removeChild(this.closest('.fixed'))" 
                        class="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition-colors text-left">
                    <i class="fas fa-download mr-3"></i>
                    <strong>Download Calendar File (.ics)</strong>
                    <div class="text-sm opacity-90">Best option - Works with all calendar apps</div>
                </button>
                
                <button onclick="exportToGoogleCalendarURL(); document.body.removeChild(this.closest('.fixed'))" 
                        class="w-full bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 transition-colors text-left">
                    <i class="fab fa-google mr-3"></i>
                    <strong>Google Calendar Import</strong>
                    <div class="text-sm opacity-90">Creates individual events (opens multiple tabs)</div>
                </button>
            </div>
            
            <button onclick="document.body.removeChild(this.closest('.fixed'))" 
                    class="w-full mt-4 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition-colors">
                Cancel
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Helper Functions for ICS Export
function parseScheduleForICS(course) {
    const events = [];
    const schedule = course.classSchedule;
    
    if (!schedule) return events;
    
    // Handle both old and new formats
    const separator = schedule.includes('\n') ? '\n' : ',';
    const dayMatches = schedule.split(separator);
    
    dayMatches.forEach(daySchedule => {
        const match = daySchedule.match(/(\w+)\(([^)]+)\)/);
        if (match) {
            const [, dayName, timeRoom] = match;
            const timeMatch = timeRoom.match(/(\d{1,2}:\d{2} [AP]M)-(\d{1,2}:\d{2} [AP]M)/);
            
            if (timeMatch) {
                const [, startTime, endTime] = timeMatch;
                const event = createICSEvent(course, dayName, startTime, endTime);
                events.push(event);
            }
        }
    });
    
    return events;
}

function createICSEvent(course, dayName, startTime, endTime) {
    const eventTypeSuffix = course.eventType === 'lab' ? ' Lab' : 
                           course.eventType === 'exam' ? ' Exam' : '';
    
    const summary = `${course.editableCourseName}${eventTypeSuffix} (${course.editableRoomNumber})`;
    const description = `Course: ${course.editableCourseTitle}\\nInstructor: ${course.editableFacultyName}\\nEmail: ${course.editableInstructorEmail}\\nRoom: ${course.editableRoomNumber}\\nSection: ${course.sectionName}`;
    const location = `${course.editableRoomNumber}, BRAC University`;
    
    // Get next occurrence of this day
    const dayNumber = getDayNumber(dayName);
    const today = new Date();
    const nextOccurrence = getNextDayOccurrence(today, dayNumber);
    
    // Set start and end times
    const startDateTime = new Date(nextOccurrence);
    const endDateTime = new Date(nextOccurrence);
    
    startDateTime.setHours(...parseTime(startTime));
    endDateTime.setHours(...parseTime(endTime));
    
    // Generate unique ID
    const uid = `${course.id}-${dayName}-${startDateTime.getTime()}@routine2calendar.com`;
    
    // Use local time format for better compatibility
    const startLocal = formatDateForICSLocal(startDateTime);
    const endLocal = formatDateForICSLocal(endDateTime);
    
    // Get notification time from user selection
    const notificationMinutes = getNotificationTime();
    
    const eventLines = [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTART;TZID=Asia/Dhaka:${startLocal}`,
        `DTEND;TZID=Asia/Dhaka:${endLocal}`,
        `RRULE:FREQ=WEEKLY;COUNT=15`, // 15 weeks semester
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        `LOCATION:${location}`,
        `CATEGORIES:${course.eventType.toUpperCase()}`,
        'STATUS:CONFIRMED',
        'TRANSP:OPAQUE'
    ];
    
    // Add alarm/reminder if notification time is set
    if (notificationMinutes > 0) {
        eventLines.push(
            'BEGIN:VALARM',
            'ACTION:DISPLAY',
            `DESCRIPTION:Reminder: ${summary}`,
            `TRIGGER:-PT${notificationMinutes}M`,
            'END:VALARM'
        );
    }
    
    eventLines.push('END:VEVENT');
    
    return eventLines;
}

function formatDateForICSLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

function parseScheduleForGoogleURL(course) {
    const events = [];
    const schedule = course.classSchedule;
    
    if (!schedule) return events;
    
    // Handle both old and new formats
    const separator = schedule.includes('\n') ? '\n' : ',';
    const dayMatches = schedule.split(separator);
    
    dayMatches.forEach(daySchedule => {
        const match = daySchedule.match(/(\w+)\(([^)]+)\)/);
        if (match) {
            const [, dayName, timeRoom] = match;
            const timeMatch = timeRoom.match(/(\d{1,2}:\d{2} [AP]M)-(\d{1,2}:\d{2} [AP]M)/);
            
            if (timeMatch) {
                const [, startTime, endTime] = timeMatch;
                const url = createGoogleCalendarURL(course, dayName, startTime, endTime);
                events.push(url);
            }
        }
    });
    
    return events;
}

function createGoogleCalendarURL(course, dayName, startTime, endTime) {
    const eventTypeSuffix = course.eventType === 'lab' ? ' Lab' : 
                           course.eventType === 'exam' ? ' Exam' : '';
    
    const title = `${course.editableCourseName}${eventTypeSuffix} (${course.editableRoomNumber})`;
    
    // Get notification time and create reminder text
    const notificationMinutes = getNotificationTime();
    const reminderText = notificationMinutes > 0 ? 
        `\\n\\n🔔 Reminder: Set ${getNotificationTimeText(notificationMinutes)} reminder in Google Calendar` : '';
    
    const details = `Course: ${course.editableCourseTitle}\\nInstructor: ${course.editableFacultyName}\\nEmail: ${course.editableInstructorEmail}\\nRoom: ${course.editableRoomNumber}${reminderText}`;
    const location = 'BRAC University';
    
    // Get next occurrence of this day
    const dayNumber = getDayNumber(dayName);
    const today = new Date();
    const nextOccurrence = getNextDayOccurrence(today, dayNumber);
    
    // Set start and end times
    const startDateTime = new Date(nextOccurrence);
    const endDateTime = new Date(nextOccurrence);
    
    startDateTime.setHours(...parseTime(startTime));
    endDateTime.setHours(...parseTime(endTime));
    
    const startFormatted = formatDateForGoogle(startDateTime);
    const endFormatted = formatDateForGoogle(endDateTime);
    
    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: title,
        dates: `${startFormatted}/${endFormatted}`,
        details: details,
        location: location,
        recur: 'RRULE:FREQ=WEEKLY;COUNT=15'
    });
    
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function copyCalendarText() {
    if (selectedCourses.length === 0) {
        alert('No courses selected to copy.');
        return;
    }
    
    let scheduleText = "BRACU Class Schedule\\n\\n";
    
    selectedCourses.forEach((course, index) => {
        scheduleText += `${index + 1}. ${course.editableCourseName}\\n`;
        scheduleText += `   Title: ${course.editableCourseTitle}\\n`;
        scheduleText += `   Instructor: ${course.editableFacultyName}\\n`;
        scheduleText += `   Room: ${course.editableRoomNumber}\\n`;
        scheduleText += `   Schedule: ${parseSchedule(course.classSchedule)}\\n`;
        scheduleText += `   Type: ${course.eventType.charAt(0).toUpperCase() + course.eventType.slice(1)}\\n\\n`;
    });
    
    // Copy to clipboard
    navigator.clipboard.writeText(scheduleText).then(() => {
        showNotification('Schedule copied to clipboard', 'success');
    }).catch(err => {
        console.error('Failed to copy: ', err);
        // Fallback: create a text area and select it
        const textArea = document.createElement('textarea');
        textArea.value = scheduleText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showNotification('Schedule copied to clipboard!', 'success');
    });
}

function downloadICSFile(content, filename) {
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

function formatDateForICS(date) {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function formatDateForGoogle(date) {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function showImportInstructions() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h3 class="text-lg font-bold text-gray-900 mb-4">
                <i class="fas fa-info-circle text-blue-600 mr-2"></i>How to Import Your Schedule
            </h3>
            
            <div class="space-y-4 text-sm text-gray-700">
                
                <div>
                    <h4 class="font-semibold text-gray-900 mb-2">💻 Google Calendar:</h4>
                    <ol class="list-decimal list-inside space-y-1 ml-4">
                        <li>Go to calendar.google.com</li>
                        <li>Click the gear icon → Settings</li>
                        <li>Click "Import & export" in the left sidebar</li>
                        <li>Select the downloaded .ics file</li>
                    </ol>
                </div>
                
                <div>
                    <h4 class="font-semibold text-gray-900 mb-2">📧 Outlook:</h4>
                    <ol class="list-decimal list-inside space-y-1 ml-4">
                        <li>Open Outlook</li>
                        <li>Go to File → Open & Export → Import/Export</li>
                        <li>Choose "Import an iCalendar (.ics) file"</li>
                        <li>Select your downloaded file</li>
                    </ol>
                </div>
                
                <div>
                    <h4 class="font-semibold text-gray-900 mb-2">🍎 Apple Calendar:</h4>
                    <ol class="list-decimal list-inside space-y-1 ml-4">
                        <li>Double-click the downloaded .ics file</li>
                        <li>Or drag and drop it into Calendar app</li>
                    </ol>
                </div>
            </div>
            
            <button onclick="document.body.removeChild(this.closest('.fixed'))" 
                    class="w-full mt-6 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors">
                Got it
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function getDayNumber(dayName) {
    const days = {
        'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
        'thursday': 4, 'friday': 5, 'saturday': 6
    };
    return days[dayName.toLowerCase()] || 0;
}

function getNextDayOccurrence(date, dayNumber) {
    const today = new Date(date);
    const currentDay = today.getDay();
    const daysUntilTarget = (dayNumber - currentDay + 7) % 7;
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + (daysUntilTarget || 7));
    return targetDate;
}

function parseTime(timeString) {
    const [time, meridiem] = timeString.split(' ');
    const [hours, minutes] = time.split(':').map(Number);
    
    let hour24 = hours;
    if (meridiem === 'PM' && hours !== 12) {
        hour24 += 12;
    } else if (meridiem === 'AM' && hours === 12) {
        hour24 = 0;
    }
    
    return [hour24, minutes, 0, 0];
}

// Helper function to get selected notification time
function getNotificationTime() {
    const selector = document.getElementById('notificationTime');
    return selector ? parseInt(selector.value) : 10; // Default to 10 minutes
}

// Helper function to format notification time text
function getNotificationTimeText(minutes) {
    if (minutes === 0) return 'at event time';
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} hour${Math.floor(minutes / 60) > 1 ? 's' : ''}`;
    return `${Math.floor(minutes / 1440)} day${Math.floor(minutes / 1440) > 1 ? 's' : ''}`;
}

// Utility functions
function showLoading() {
    document.getElementById('loadingState').classList.remove('hidden');
    document.getElementById('initialState').classList.add('hidden');
    document.getElementById('courseSelection').classList.add('hidden');
}

function showInitialState() {
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('initialState').classList.remove('hidden');
    document.getElementById('courseSelection').classList.add('hidden');
}

function showCourseSelection() {
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('initialState').classList.add('hidden');
    document.getElementById('courseSelection').classList.remove('hidden');
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    const isMobile = window.innerWidth < 640;
    
    notification.className = `fixed z-50 p-3 sm:p-4 rounded-lg text-white text-sm sm:text-base ${
        isMobile ? 'top-4 left-3 right-3' : 'top-4 right-4'
    } ${type === 'success' ? 'bg-green-600' : 
        type === 'error' ? 'bg-red-600' : 'bg-blue-600'
    }`;
    
    notification.innerHTML = `
        <div class="flex items-center justify-between">
            <span class="break-words">${message}</span>
            <button onclick="this.parentElement.parentElement.remove()" class="ml-2 text-white opacity-70 hover:opacity-100 shrink-0">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 4 seconds on mobile, 3 seconds on desktop
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, isMobile ? 4000 : 3000);
}

// Local Storage functions
function saveToLocalStorage() {
    localStorage.setItem('selectedCourses', JSON.stringify(selectedCourses));
}

function loadFromLocalStorage() {
    const savedCourses = localStorage.getItem('selectedCourses');
    const savedData = localStorage.getItem('courseData');
    
    if (savedCourses) {
        selectedCourses = JSON.parse(savedCourses);
        updateSelectedCoursesDisplay();
    }
    
    if (savedData) {
        courseData = JSON.parse(savedData);
        populateFilters();
        showCourseSelection();
        displayCourses();
    } else {
        loadCourseData();
    }
}
