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
        // Subscribe to data updates - using same formatting as watch.js data views
        xf.sub('db:power1s', (value) => {
            // PowerValue: Math.round(state)
            this.data.power = value ? Math.round(value) : '--';
            this.updatePIPData();
        });

        xf.sub('db:heartRate', (value) => {
            // HeartRateValue: Math.round(state)
            this.data.heartRate = value ? Math.round(value) : '--';
            this.updatePIPData();
        });

        xf.sub('db:cadence', (value) => {
            // CadenceValue: Math.round(state)
            this.data.cadence = value ? Math.round(value) : '--';
            this.updatePIPData();
        });

        xf.sub('db:speed', (value) => {
            // SpeedValue: (state).toFixed(1)
            this.data.speed = value ? value.toFixed(1) : '--';
            this.updatePIPData();
        });

        xf.sub('db:elapsed', (value) => {
            // TimerTime: formatTime({value: this.state, format: this.format, unit: 'seconds'})
            this.data.elapsedTime = value ? formatTime({value: value, format: 'hh:mm:ss', unit: 'seconds'}) : '--:--:--';
            this.updatePIPData();
        });

        xf.sub('db:distance', (value) => {
            // DistanceValue: (state).toFixed(2)
            this.data.distance = value ? value.toFixed(2) : '--';
            this.updatePIPData();
        });

        xf.sub('db:powerTarget', (value) => {
            // PowerTarget: Math.round(state)
            this.data.target = value ? Math.round(value) : '--';
            this.updatePIPData();
        });

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
                width: 480,
                height: 180
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
        canvas.width = 480;
        canvas.height = 180;
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
        // Clear canvas with dark background
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);

        // Grid layout - 3 columns, 3 rows
        const cols = 3;
        const rows = 3;
        const tileWidth = width / cols;
        const tileHeight = height / rows;

        const metrics = [
            { label: 'Power', value: this.data.power, unit: 'W' },
            { label: 'Heart Rate', value: this.data.heartRate, unit: 'bpm' },
            { label: 'Cadence', value: this.data.cadence, unit: 'rpm' },
            { label: 'Speed', value: this.data.speed, unit: 'km/h' },
            { label: 'Interval', value: '--:--', unit: '' },
            { label: 'Target', value: this.data.target, unit: 'W' },
            { label: 'Elapsed', value: this.data.elapsedTime, unit: '' },
            { label: 'Distance', value: this.data.distance, unit: 'km' },
            { label: '', value: '', unit: '' } // Empty tile
        ];

        // Draw each metric tile
        metrics.forEach((metric, index) => {
            if (!metric.label) return; // Skip empty tiles

            const col = index % cols;
            const row = Math.floor(index / cols);
            const x = col * tileWidth;
            const y = row * tileHeight;

            // Draw tile border
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, tileWidth, tileHeight);

            // Draw label
            ctx.fillStyle = '#888';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(metric.label, x + tileWidth/2, y + 20);

            // Draw value
            ctx.fillStyle = '#FFF';
            ctx.font = 'bold 18px Arial';
            ctx.fillText(metric.value, x + tileWidth/2, y + tileHeight/2 + 5);

            // Draw unit
            if (metric.unit) {
                ctx.fillStyle = '#888';
                ctx.font = '10px Arial';
                ctx.fillText(metric.unit, x + tileWidth/2, y + tileHeight - 15);
            }
        });
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
                width: 480,
                height: 180
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
            <div class="pip-container">
                <div class="data-tiles">
                    <div class="data-tile" id="data-tile--power">
                        <h2 class="data-tile--heading">Power</h2>
                        <div class="data-tile--value-cont">
                            <span id="pip-power" class="data-tile--value">${this.data.power}</span>
                        </div>
                    </div>

                    <div class="data-tile" id="data-tile--heart-rate">
                        <h2 class="data-tile--heading">Heart Rate</h2>
                        <div class="data-tile--value-cont">
                            <span id="pip-hr" class="data-tile--value">${this.data.heartRate}</span>
                        </div>
                    </div>

                    <div class="data-tile" id="data-tile--cadence">
                        <h2 class="data-tile--heading">Cadence</h2>
                        <div class="data-tile--value-cont">
                            <span id="pip-cadence" class="data-tile--value">${this.data.cadence}</span>
                        </div>
                    </div>

                    <div class="data-tile" id="data-tile--speed">
                        <h2 class="data-tile--heading">Speed</h2>
                        <div class="data-tile--value-cont">
                            <span id="pip-speed" class="data-tile--value">${this.data.speed}</span>
                        </div>
                    </div>

                    <div class="data-tile" id="data-tile--interval-time">
                        <h2 class="data-tile--heading">Interval Time</h2>
                        <div class="data-tile--value-cont">
                            <span id="pip-interval" class="data-tile--value">--:--</span>
                        </div>
                    </div>

                    <div class="data-tile" id="data-tile--elapsed-time">
                        <h2 class="data-tile--heading">Elapsed Time</h2>
                        <div class="data-tile--value-cont">
                            <span id="pip-time" class="data-tile--value">${this.data.elapsedTime}</span>
                        </div>
                    </div>

                    <div class="data-tile" id="data-tile--target">
                        <h2 class="data-tile--heading">Target</h2>
                        <div class="data-tile--value-cont">
                            <span id="pip-target" class="data-tile--value">${this.data.target}</span>
                        </div>
                    </div>

                    <div class="data-tile" id="data-tile--distance">
                        <h2 class="data-tile--heading">Distance</h2>
                        <div class="data-tile--value-cont">
                            <span id="pip-distance" class="data-tile--value">${this.data.distance}</span>
                        </div>
                    </div>

                </div> <!-- end data-tiles -->
            </div> <!-- end pip-container -->
        `;
    }

    copyStylesToPIP(pipDocument) {
        console.log('Copying styles to PIP window...');

        // Copy CSS styles to PIP window
        const stylesheets = document.querySelectorAll('link[rel="stylesheet"], style');
        console.log(`Found ${stylesheets.length} stylesheets to copy`);

        stylesheets.forEach((stylesheet, index) => {
            const clone = stylesheet.cloneNode(true);
            pipDocument.head.appendChild(clone);
            console.log(`Copied stylesheet ${index + 1}:`, stylesheet.href || 'inline styles');
        });

        // Also copy any inline styles from the main document
        const mainStyles = document.head.querySelector('style');
        if (mainStyles) {
            const styleClone = mainStyles.cloneNode(true);
            pipDocument.head.appendChild(styleClone);
        }

        // Add a fallback stylesheet URL if none found
        if (stylesheets.length === 0) {
            console.log('No stylesheets found, adding fallback link to main CSS');
            const fallbackLink = pipDocument.createElement('link');
            fallbackLink.rel = 'stylesheet';
            fallbackLink.href = './index.css';
            pipDocument.head.appendChild(fallbackLink);
        }
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
            power: this.pipDocument.querySelector('#pip-power'),
            hr: this.pipDocument.querySelector('#pip-hr'),
            cadence: this.pipDocument.querySelector('#pip-cadence'),
            speed: this.pipDocument.querySelector('#pip-speed'),
            time: this.pipDocument.querySelector('#pip-time'),
            target: this.pipDocument.querySelector('#pip-target'),
            distance: this.pipDocument.querySelector('#pip-distance')
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