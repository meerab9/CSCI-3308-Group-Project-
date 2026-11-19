
// Discover page: load profiles from the database
const profileFeed = document.getElementById("profileFeed");
const emptyState = document.getElementById("emptyState");

let profiles = [];
let connectionModal = null;

// Initialize the existing Bootstrap modal
if (window.bootstrap) {
    connectionModal = new bootstrap.Modal(
        document.getElementById("connectionModal")
    );
}

// Create an HTML element and safely insert text
function createElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    if (text !== undefined && text !== null) {
        element.textContent = text;
    }

    return element;
}

// Create a Bootstrap icon
function createIcon(iconName) {
    const icon = document.createElement("i");
    icon.className = `bi ${iconName}`;
    return icon;
}

// Create skill and interest tags
function createTags(items, extraClass = "") {
    const container = createElement("div", `profile-tags ${extraClass}`.trim());

    items.forEach(item => {
        container.appendChild(createElement("span", "", item));
    });

    return container;
}

// Determine which existing filters a profile belongs to
function getCategories(profile) {
    const details = [
        profile.major,
        ...(profile.skills || []),
        ...(profile.interests || []),
        ...(profile.projects || []).flatMap(project => [
            project.project_name,
            project.description,
            ...(project.technologies || [])
        ])
    ].filter(Boolean).join(" ").toLowerCase();

    const categories = [];

    if (/computer science|software|program|javascript|python|java|react|sql|web development/.test(details)) {
        categories.push("software");
    }

    if (/artificial intelligence|\bai\b|machine learning|data science/.test(details)) {
        categories.push("ai");
    }

    if (/robot|hardware|embedded|arduino|c\+\+|electrical/.test(details)) {
        categories.push("hardware");
    }

    if (/design|figma|ui\/ux|user experience|accessibility/.test(details)) {
        categories.push("design");
    }

    return categories;
}

// Build one profile card from a database profile
function createProfileCard(profile, index) {
    const card = createElement("article", "profile-card");

    card.dataset.username = profile.username;
    card.dataset.category = getCategories(profile).join(" ");

    const image = createElement(
        "div",
        `profile-image profile-${["one", "two", "three", "four"][index % 4]}`
    );

    const label = createElement("span", "profile-label");
    label.appendChild(createIcon("bi-code-slash"));
    label.appendChild(document.createTextNode(" Student Developer"));
    image.appendChild(label);

    const content = createElement("div", "profile-content");

    // Profile heading
    const header = createElement("div", "profile-header");
    const headingContainer = document.createElement("div");

    headingContainer.appendChild(
        createElement("h2", "", profile.full_name || profile.username)
    );

    headingContainer.appendChild(
        createElement("p", "username", `@${profile.username}`)
    );

    header.appendChild(headingContainer);
    content.appendChild(header);

    // Bio
    content.appendChild(
        createElement(
            "p",
            "profile-bio",
            profile.bio || "This user hasn't added a bio yet."
        )
    );

    // Location and major
    const details = createElement("div", "profile-details");

    const location = document.createElement("span");
    location.appendChild(createIcon("bi-geo-alt"));
    location.appendChild(
        document.createTextNode(` ${profile.location || "Location not provided"}`)
    );

    const major = document.createElement("span");
    major.appendChild(createIcon("bi-mortarboard"));
    major.appendChild(
        document.createTextNode(` ${profile.major || "Major not provided"}`)
    );

    details.append(location, major);
    content.appendChild(details);

    // Skills
    const skillsSection = createElement("div", "profile-section");
    skillsSection.appendChild(createElement("h6", "", "Skills"));
    skillsSection.appendChild(createTags(profile.skills || []));
    content.appendChild(skillsSection);

    // Interests
    const interestsSection = createElement("div", "profile-section");
    interestsSection.appendChild(createElement("h6", "", "Interests"));
    interestsSection.appendChild(
        createTags(profile.interests || [], "interests")
    );
    content.appendChild(interestsSection);

    // Projects
    const project = profile.projects && profile.projects[0];

    const projectPreview = createElement("div", "project-preview");
    const projectHeading = createElement("h6");

    projectHeading.appendChild(createIcon("bi-folder2-open"));
    projectHeading.appendChild(document.createTextNode(" Current Project"));

    projectPreview.appendChild(projectHeading);

    if (project) {
        projectPreview.appendChild(
            createElement("strong", "", project.project_name)
        );

        projectPreview.appendChild(
            createElement(
                "p",
                "",
                project.description || "No project description provided."
            )
        );

        if (project.technologies && project.technologies.length > 0) {
            projectPreview.appendChild(
                createElement(
                    "p",
                    "",
                    `Technologies: ${project.technologies.join(", ")}`
                )
            );
        }
    } else {
        projectPreview.appendChild(
            createElement("p", "", "No projects added yet.")
        );
    }

    content.appendChild(projectPreview);

    // Connect and Pass buttons
    const actions = createElement("div", "profile-actions");

    const passButton = createElement("button", "pass-btn");
    passButton.type = "button";
    passButton.appendChild(createIcon("bi-x-lg"));
    passButton.appendChild(document.createTextNode(" Pass"));

    const connectButton = createElement("button", "connect-btn");
    connectButton.type = "button";
    connectButton.appendChild(createIcon("bi-person-plus"));
    connectButton.appendChild(document.createTextNode(" Connect"));

    actions.append(passButton, connectButton);
    content.appendChild(actions);

    card.append(image, content);

    // Mobile swipe functionality
    addSwipeListeners(card);

    return card;
}

// Display all retrieved profiles
function renderProfiles() {
    profileFeed.replaceChildren();

    profiles.forEach((profile, index) => {
        profileFeed.appendChild(createProfileCard(profile, index));
    });

    applyCurrentFilter();
}

// Load profiles from Express API
async function loadProfiles() {
    try {
        const response = await fetch("/api/discover");

        if (!response.ok) {
            throw new Error(`Unable to load profiles (${response.status})`);
        }

        profiles = await response.json();

        renderProfiles();

    } catch (error) {
        console.error("Discover loading error:", error);

        emptyState.hidden = false;
        emptyState.querySelector("h3").textContent = "Unable to load profiles";
        emptyState.querySelector("p").textContent =
            "Please refresh the page and try again.";
    }
}

// Update empty state based on visible profiles
function checkEmptyState() {
    const visibleProfiles = [
        ...document.querySelectorAll(".profile-card")
    ].filter(card => card.style.display !== "none");

    emptyState.hidden = visibleProfiles.length > 0;

    if (visibleProfiles.length === 0) {
        emptyState.querySelector("h3").textContent = "No more profiles";
        emptyState.querySelector("p").textContent =
            "Check back later for more people to connect with.";
    }
}

// Apply the selected category filter
function applyCurrentFilter() {
    const activeFilter = document.querySelector(".filter-btn.active");
    const selectedFilter = activeFilter
        ? activeFilter.dataset.filter
        : "all";

    document.querySelectorAll(".profile-card").forEach(card => {
        const categories = card.dataset.category.split(" ");

        card.style.display =
            selectedFilter === "all" ||
            categories.includes(selectedFilter)
                ? "block"
                : "none";
    });

    checkEmptyState();
}

// Filter button functionality
document.querySelectorAll(".filter-btn").forEach(button => {
    button.addEventListener("click", () => {
        document.querySelectorAll(".filter-btn").forEach(btn => {
            btn.classList.remove("active");
        });

        button.classList.add("active");
        applyCurrentFilter();
    });
});

// Connect with a user (UI only for now)

async function handleConnect(button) {
    const card = button.closest(".profile-card");
    if (!card) return;

    const username = card.dataset.username;
    const name = card.querySelector("h2").textContent;

    // Prevent multiple requests while one is processing.
    button.disabled = true;
    button.textContent = " Sending...";

    try {
        const response = await fetch(
            `/api/connections/${encodeURIComponent(username)}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Unable to send connection request.");
        }

        // Show successful confirmation.
        document.getElementById("connectionMessage").textContent =
            `Your connection request to ${name} has been sent!`;

        if (connectionModal) {
            connectionModal.show();
        }

        // Remove the card only after the request succeeds.
        card.remove();
        checkEmptyState();

    } catch (error) {
        console.error("Connection request error:", error);

        alert(error.message);

        button.disabled = false;
        button.innerHTML = '<i class="bi bi-person-plus"></i> Connect';
    }
}


function handleConnect(button) {
    const card = button.closest(".profile-card");
    if (!card) return;

    const name = card.querySelector("h2").textContent;

    document.getElementById("connectionMessage").textContent =
        `Connection requests for ${name} will be connected to the database in the next stage.`;

    if (connectionModal) {
        connectionModal.show();
    }

    card.remove();
    checkEmptyState();
}

// Pass on a user (UI only for now)
function handlePass(button) {
    const card = button.closest(".profile-card");

    card.remove();
    checkEmptyState();
}

// Handle clicks on dynamically generated buttons
profileFeed.addEventListener("click", event => {
    const connectButton = event.target.closest(".connect-btn");
    const passButton = event.target.closest(".pass-btn");

    if (connectButton) {
        handleConnect(connectButton);
    } else if (passButton) {
        handlePass(passButton);
    }
});

// Touch swipe functionality
function addSwipeListeners(card) {
    let startX = 0;
    let startY = 0;

    card.addEventListener("touchstart", event => {
        startX = event.changedTouches[0].screenX;
        startY = event.changedTouches[0].screenY;
    }, { passive: true });

    card.addEventListener("touchend", event => {
        const endX = event.changedTouches[0].screenX;
        const endY = event.changedTouches[0].screenY;

        const differenceX = endX - startX;
        const differenceY = endY - startY;

        if (
            Math.abs(differenceX) > 100 &&
            Math.abs(differenceX) > Math.abs(differenceY)
        ) {
            if (differenceX > 0) {
                handleConnect(card.querySelector(".connect-btn"));
            } else {
                handlePass(card.querySelector(".pass-btn"));
            }
        }
    });
}

// Start loading profiles
loadProfiles();
