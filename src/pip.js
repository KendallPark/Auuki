import { xf, exists } from './functions.js';
import { formatTime } from './utils.js';

/**
 * Picture-in-Picture (PIP) module for Android
 * Displays cycling data in a compact floating window
 */
class PIPManager {
    constructor() {
        this.isSupported = this.checkPIPSupport();
        this.isPIPActive = false;
        this.pipWindow = null;
        this.data = {
            power: '--',
            heartRate: '--',
            cadence: '--',
            speed: '--',
            elapsedTime: '--:--:--',
            distance: '--',
            target: '--'
        };

        if (this.isSupported) {
            this.init();
        }
    }

    checkPIPSupport() {
        // Check if Picture-in-Picture API is available
        const hasDocumentPIP = 'documentPictureInPicture' in window;
        const hasVideoPIP = 'requestPictureInPicture' in HTMLVideoElement.prototype;

        console.log('PIP Support Check:', {
            documentPIP: hasDocumentPIP,
            videoPIP: hasVideoPIP,
            userAgent: navigator.userAgent
        });

        return hasDocumentPIP || hasVideoPIP;
    }

    init() {
        // Subscribe to data updates
        xf.sub('db:power1s', (value) => { this.data.power = value || '--'; this.updatePIPData(); });
        xf.sub('db:heartRate', (value) => { this.data.heartRate = value || '--'; this.updatePIPData(); });
        xf.sub('db:cadence', (value) => { this.data.cadence = value || '--'; this.updatePIPData(); });
        xf.sub('db:speed', (value) => { this.data.speed = value || '--'; this.updatePIPData(); });
        xf.sub('db:elapsed', (value) => {
            // Format elapsed time properly - value is in seconds
            const hours = Math.floor(value / 3600);
            const minutes = Math.floor((value % 3600) / 60);
            const seconds = Math.floor(value % 60);
            this.data.elapsedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            this.updatePIPData();
        });
        xf.sub('db:distance', (value) => { this.data.distance = value || '--'; this.updatePIPData(); });
        xf.sub('db:powerTarget', (value) => { this.data.target = value || '--'; this.updatePIPData(); });

        // Listen for PIP events
        document.addEventListener('enterpictureinpicture', this.onEnterPIP.bind(this));
        document.addEventListener('leavepictureinpicture', this.onLeavePIP.bind(this));
    }

    async enterPIP() {
        console.log('enterPIP called');

        if (!this.isSupported) {
            console.warn('Picture-in-Picture not supported');
            return false;
        }

        try {
            // Try Document PIP first (Chrome/Edge)
            if ('documentPictureInPicture' in window) {
                console.log('Attempting Document PIP...');
                return await this.enterDocumentPIP();
            }

            // Fallback to Video PIP (Safari/Firefox)
            if ('requestPictureInPicture' in HTMLVideoElement.prototype) {
                console.log('Attempting Video PIP...');
                return await this.enterVideoPIP();
            }

            console.warn('No PIP API available');
            return false;
        } catch (error) {
            console.error('Failed to enter PIP mode:', error);
            return false;
        }
    }

    async enterDocumentPIP() {
        try {
            const pipWindow = await window.documentPictureInPicture.requestWindow({
                width: 320,
                height: 240
            });

            // Create PIP content
            const pipContent = this.createPIPHTML();
            pipWindow.document.body.innerHTML = pipContent;

            // Copy styles to PIP window
            this.copyStylesToPIP(pipWindow.document);

            // Store reference
            this.pipWindow = pipWindow;
            this.pipDocument = pipWindow.document;
            this.isPIPActive = true;

            // Update content immediately
            this.updatePIPContent();

            // Listen for close
            pipWindow.addEventListener('pagehide', this.onLeavePIP.bind(this));

            console.log('Document PIP activated');
            xf.dispatch('pip:entered');
            return true;
        } catch (error) {
            console.error('Document PIP failed:', error);
            return false;
        }
    }

    async enterVideoPIP() {
        try {
            // Create a video element as PIP container
            const video = this.createPIPVideo();
            document.body.appendChild(video);

            // Wait for video to be ready before requesting PIP
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Video load timeout'));
                }, 5000);

                const onReady = () => {
                    clearTimeout(timeout);
                    video.removeEventListener('loadedmetadata', onReady);
                    video.removeEventListener('canplay', onReady);
                    resolve();
                };

                video.addEventListener('loadedmetadata', onReady);
                video.addEventListener('canplay', onReady);

                // Start playing to ensure metadata loads
                video.play().catch(console.warn);
            });

            // Request Picture-in-Picture
            this.pipWindow = await video.requestPictureInPicture();
            this.isPIPActive = true;

            console.log('Video PIP activated');
            xf.dispatch('pip:entered');
            return true;
        } catch (error) {
            console.error('Video PIP failed:', error);
            return false;
        }
    }

    exitPIP() {
        if (this.isPIPActive && document.pictureInPictureElement) {
            document.exitPictureInPicture();
        }
    }

    createPIPVideo() {
        const video = document.createElement('video');
        video.id = 'pip-video';
        video.style.display = 'none';
        video.muted = true;
        video.autoplay = true;
        video.loop = true;

        // Create a simple canvas to use as video source
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 240;
        const ctx = canvas.getContext('2d');

        // Create a simple animation loop for the video
        const animate = () => {
            this.drawPIPContent(ctx, canvas.width, canvas.height);
            requestAnimationFrame(animate);
        };
        animate();

        // Capture canvas as video stream
        const stream = canvas.captureStream(30);
        video.srcObject = stream;

        return video;
    }

    drawPIPContent(ctx, width, height) {
        // Clear canvas
        ctx.fillStyle = '#28272D';
        ctx.fillRect(0, 0, width, height);

        // Set text style
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'left';

        const lineHeight = 25;
        let y = 30;

        // Draw cycling data
        ctx.fillText(`Power: ${this.data.power}W`, 20, y);
        y += lineHeight;
        ctx.fillText(`HR: ${this.data.heartRate} bpm`, 20, y);
        y += lineHeight;
        ctx.fillText(`Cadence: ${this.data.cadence} rpm`, 20, y);
        y += lineHeight;
        ctx.fillText(`Speed: ${this.data.speed} km/h`, 20, y);
        y += lineHeight;
        ctx.fillText(`Time: ${this.data.elapsedTime}`, 20, y);
        y += lineHeight;
        ctx.fillText(`Target: ${this.data.target}W`, 20, y);

        // Draw distance in larger text at bottom
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${this.data.distance} km`, width / 2, height - 20);
    }

    setupPIPContent() {
        if (!this.pipWindow) return;

        // Setup PIP window content using Document Picture-in-Picture API (if available)
        if ('documentPictureInPicture' in window) {
            this.setupDocumentPIP();
        }
    }

    async setupDocumentPIP() {
        try {
            const pipDocument = await window.documentPictureInPicture.requestWindow({
                width: 320,
                height: 240
            });

            // Create PIP content
            const pipContent = this.createPIPHTML();
            pipDocument.body.innerHTML = pipContent;

            // Copy styles to PIP window
            this.copyStylesToPIP(pipDocument);

            // Store reference
            this.pipDocument = pipDocument;

            // Update content
            this.updatePIPContent();

        } catch (error) {
            console.error('Failed to setup Document PIP:', error);
        }
    }

    createPIPHTML() {
        return `
            <div id="pip-container" style="
                font-family: 'Roboto', Arial, sans-serif;
                background: #28272D;
                color: #FFFFFF;
                padding: 15px;
                width: 100%;
                height: 100vh;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
            ">
                <div id="pip-data" style="
                    display: grid;
                    gap: 8px;
                    font-size: 14px;
                    font-weight: 500;
                ">
                    <div id="pip-power">Power: <span>--</span>W</div>
                    <div id="pip-hr">HR: <span>--</span> bpm</div>
                    <div id="pip-cadence">Cadence: <span>--</span> rpm</div>
                    <div id="pip-speed">Speed: <span>--</span> km/h</div>
                    <div id="pip-time">Time: <span>--:--:--</span></div>
                    <div id="pip-target">Target: <span>--</span>W</div>
                </div>
                <div id="pip-distance" style="
                    text-align: center;
                    font-size: 18px;
                    font-weight: bold;
                    border-top: 1px solid #444;
                    padding-top: 10px;
                ">
                    <span>--</span> km
                </div>
            </div>
        `;
    }

    copyStylesToPIP(pipDocument) {
        // Copy CSS styles to PIP window
        const stylesheets = document.querySelectorAll('link[rel="stylesheet"], style');
        stylesheets.forEach(stylesheet => {
            const clone = stylesheet.cloneNode(true);
            pipDocument.head.appendChild(clone);
        });
    }

    updatePIPData() {
        if (!this.isPIPActive) return;

        // Update canvas-based PIP (fallback)
        // Canvas content is updated in drawPIPContent

        // Update Document PIP content (if available)
        if (this.pipDocument) {
            this.updatePIPContent();
        }
    }

    updatePIPContent() {
        if (!this.pipDocument) return;

        const elements = {
            power: this.pipDocument.querySelector('#pip-power span'),
            hr: this.pipDocument.querySelector('#pip-hr span'),
            cadence: this.pipDocument.querySelector('#pip-cadence span'),
            speed: this.pipDocument.querySelector('#pip-speed span'),
            time: this.pipDocument.querySelector('#pip-time span'),
            target: this.pipDocument.querySelector('#pip-target span'),
            distance: this.pipDocument.querySelector('#pip-distance span')
        };

        if (elements.power) elements.power.textContent = this.data.power;
        if (elements.hr) elements.hr.textContent = this.data.heartRate;
        if (elements.cadence) elements.cadence.textContent = this.data.cadence;
        if (elements.speed) elements.speed.textContent = this.data.speed;
        if (elements.time) elements.time.textContent = this.data.elapsedTime;
        if (elements.target) elements.target.textContent = this.data.target;
        if (elements.distance) elements.distance.textContent = this.data.distance;
    }

    onEnterPIP() {
        this.isPIPActive = true;
        console.log('Entered PIP mode');
        xf.dispatch('pip:entered');
    }

    onLeavePIP() {
        this.isPIPActive = false;
        this.pipWindow = null;
        this.pipDocument = null;

        // Clean up video element
        const video = document.getElementById('pip-video');
        if (video) {
            video.remove();
        }

        console.log('Left PIP mode');
        xf.dispatch('pip:exited');
    }

    toggle() {
        console.log('PIP Manager toggle called. Current state:', {
            isSupported: this.isSupported,
            isPIPActive: this.isPIPActive
        });

        if (!this.isSupported) {
            console.warn('PIP not supported on this device/browser');
            return Promise.resolve(false);
        }

        if (this.isPIPActive) {
            this.exitPIP();
            return Promise.resolve(true);
        } else {
            return this.enterPIP();
        }
    }

    getStatus() {
        return {
            isSupported: this.isSupported,
            isActive: this.isPIPActive
        };
    }
}

// Create global PIP manager instance
const pipManager = new PIPManager();

export default pipManager;