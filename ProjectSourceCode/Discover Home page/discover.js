
// Get all profile cards
const profileCards = document.querySelectorAll(".profile-card");

const connectionModal = new bootstrap.Modal(
    document.getElementById("connectionModal")
);

// Connect with a user
function handleConnect(button) {

    const card = button.closest(".profile-card");
    const name = card.querySelector("h2").textContent;

    document.getElementById("connectionMessage").textContent =
        `Your connection request to ${name} has been sent.`;

    connectionModal.show();

    // Remove profile from discovery feed
    card.remove();

    checkEmptyState();
}

// Pass on a user
function handlePass(button) {

    const card = button.closest(".profile-card");

    card.remove();

    checkEmptyState();
}

// Check whether profiles remain
function checkEmptyState() {

    const remainingProfiles =
        document.querySelectorAll(".profile-card");

    document.getElementById("emptyState").hidden =
        remainingProfiles.length > 0;
}


// Filter profiles by category
document.querySelectorAll(".filter-btn").forEach(button => {

    button.addEventListener("click", () => {

        // Update active filter
        document.querySelectorAll(".filter-btn").forEach(btn => {
            btn.classList.remove("active");
        });

        button.classList.add("active");

        const selectedFilter = button.dataset.filter;

        profileCards.forEach(card => {

            const categories = card.dataset.category.split(" ");

            if (
                selectedFilter === "all" ||
                categories.includes(selectedFilter)
            ) {
                card.style.display = "block";
            } else {
                card.style.display = "none";
            }

        });

    });

});


// Swipe functionality for mobile and touchscreens
document.querySelectorAll(".profile-card").forEach(card => {

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

        // Only count horizontal swipes
        if (Math.abs(differenceX) > 100 &&
            Math.abs(differenceX) > Math.abs(differenceY)) {

            if (differenceX > 0) {

                // Swipe right = Connect
                handleConnect(
                    card.querySelector(".connect-btn")
                );

            } else {

                // Swipe left = Pass
                handlePass(
                    card.querySelector(".pass-btn")
                );

            }

        }

    });

});
