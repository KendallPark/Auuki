import { xf } from '../functions.js';
import pipManager from '../pip.js';

/**
 * PIP Control Component
 * Provides toggle button and status management for Picture-in-Picture mode
 */
class PIPControl extends HTMLElement {
    constructor() {
        super();
        this.isSupported = pipManager.getStatus().isSupported;
        this.isActive = false;
    }

    connectedCallback() {
        this.abortController = new AbortController();
        this.signal = { signal: this.abortController.signal };

        this.render();
        this.setupEventListeners();

        // Subscribe to PIP events
        xf.sub('pip:entered', this.onPIPEntered.bind(this), this.signal);
        xf.sub('pip:exited', this.onPIPExited.bind(this), this.signal);
    }

    disconnectedCallback() {
        this.abortController.abort();
    }

    render() {
        console.log('PIP Control render called. Supported:', this.isSupported);

        if (!this.isSupported) {
            this.innerHTML = `
                <svg class="menu--btn--icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="opacity: 0.5;">
                    <path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.99h18v14.02z"/>
                    <path d="M2 2l20 20" stroke="currentColor" stroke-width="2"/>
                </svg>
                <div class="menu--btn--label">Overlay</div>
            `;
            return;
        }

        this.innerHTML = `
            <svg class="menu--btn--icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.99h18v14.02z"/>
            </svg>
            <div class="menu--btn--label">Overlay</div>
        `;
    }

    setupEventListeners() {
        if (!this.isSupported) return;

        // Add click listener to the entire component
        this.addEventListener('click', this.onTogglePIP.bind(this), this.signal);
    }

    async onTogglePIP() {
        console.log('PIP toggle clicked!');
        try {
            console.log('Attempting to toggle PIP...');
            const result = await pipManager.toggle();
            console.log('PIP toggle result:', result);
            if (result === false) {
                // Show error message if PIP failed
                this.showError('Failed to enter Picture-in-Picture mode');
            }
        } catch (error) {
            console.error('PIP toggle error:', error);
            this.showError('Picture-in-Picture error: ' + error.message);
        }
    }

    onPIPEntered() {
        this.isActive = true;
        this.updateButtonState();
    }

    onPIPExited() {
        this.isActive = false;
        this.updateButtonState();
    }

    updateButtonState() {
        // Update the component class to show active state
        if (this.isActive) {
            this.classList.add('active');
        } else {
            this.classList.remove('active');
        }
    }

    showError(message) {
        // Dispatch error message to the app's notification system
        xf.dispatch('ui:notification', {
            type: 'error',
            message: message,
            duration: 3000
        });
    }
}

// Register the custom element
customElements.define('pip-control', PIPControl);

export default PIPControl;