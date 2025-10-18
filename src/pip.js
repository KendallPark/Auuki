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
        // Clear canvas
        ctx.fillStyle = '#28272D';
        ctx.fillRect(0, 0, width, height);

        // Set text style
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'left';

        const lineHeight = 25;
        let y = 30;

        // Draw cycling data - formatted same as data tiles
        ctx.fillText(`Power: ${this.data.power}`, 20, y);
        y += lineHeight;
        ctx.fillText(`Heart Rate: ${this.data.heartRate}`, 20, y);
        y += lineHeight;
        ctx.fillText(`Cadence: ${this.data.cadence}`, 20, y);
        y += lineHeight;
        ctx.fillText(`Speed: ${this.data.speed}`, 20, y);
        y += lineHeight;
        ctx.fillText(`Elapsed Time: ${this.data.elapsedTime}`, 20, y);
        y += lineHeight;
        ctx.fillText(`Target: ${this.data.target}`, 20, y);

        // Draw distance in larger text at bottom
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Distance: ${this.data.distance}`, width / 2, height - 20);
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
                    <div class="data-tile--small wide" id="data-tile--power-avg">
                        <z-stack data-key="kcalZStack">
                            <z-stack-item class="active">
                                <h2 class="data-tile-small--heading">Power Lap</h2>
                                <div class="data-tile-small--value-cont">
                                    <power-lap id="power-lap-value"
                                                class="data-tile-small--value">--</power-lap>
                                </div>
                            </z-stack-item>
                            <z-stack-item>
                                <h2 class="data-tile-small--heading">Power Avg</h2>
                                <div class="data-tile-small--value-cont">
                                    <power-avg id="power-avg-value"
                                                class="data-tile-small--value">--</power-avg>
                                </div>
                            </z-stack-item>
                            <z-stack-item>
                                <h2 class="data-tile-small--heading">Kcal</h2>
                                <div class="data-tile-small--value-cont">
                                    <kcal-avg id="kcal-avg-value"
                                                class="data-tile-small--value">--</kcal-avg>
                                </div>
                            </z-stack-item>
                        <z-stack>
                    </div>

                    <div class="data-tile" id="data-tile--power">
                        <z-stack data-key="powerZStack">
                            <z-stack-item class="active">
                                <h2 class="data-tile--heading">Power</h2>
                                <div class="data-tile--value-cont">
                                    <power-value id=power-value"
                                                    class="data-tile--value"
                                                    prop="db:power1s">--</power-value>
                                </div>
                            </z-stack-item>
                            <z-stack-item>
                                <h2 class="data-tile--heading">Power 3s</h2>
                                <div class="data-tile--value-cont">
                                    <power-value id=power-value-3s"
                                                    class="data-tile--value"
                                                    prop="db:power3s">--</power-value>
                                </div>
                            </z-stack-item>
                        </z-stack>
                    </div>

                    <div class="data-tile" id="data-tile--interval-time">
                        <h2 class="data-tile--heading">Interval Time</h2>
                        <div class="data-tile--value-cont">
                            <interval-time id="interval-time"
                                            class="data-tile--value">--:--</interval-time>
                        </div>
                    </div>
                    <div class="data-tile" id="data-tile--heart-rate">
                        <z-stack data-key="heartRateZStack">
                            <z-stack-item class="active">
                                <h2 class="data-tile--heading">Heart Rate</h2>
                                <div class="data-tile--value-cont">
                                    <heart-rate-value id="heart-rate-value"
                                                    class="data-tile--value">--</heart-rate-value>
                                </div>
                            </z-stack-item>
                            <z-stack-item>
                                <h2 class="data-tile--heading">Heart Rate Lap</h2>
                                <div class="data-tile--value-cont">
                                    <heart-rate-lap-value id="heart-rate-lap-value"
                                                        class="data-tile--value">--</heart-rate-lap-value>
                                </div>
                            </z-stack-item>
                            <z-stack-item>
                                <h2 class="data-tile--heading">Heart Rate Avg</h2>
                                <div class="data-tile--value-cont">
                                    <heart-rate-avg-value id="heart-rate-avg-value"
                                                            class="data-tile--value">--</heart-rate-avg-value>
                                </div>
                            </z-stack-item>
                            <z-stack-item>
                                <h2 class="data-tile--heading">Heart Rate Max</h2>
                                <div class="data-tile--value-cont">
                                    <heart-rate-max-value id="heart-rate-max-value"
                                                        class="data-tile--value">--</heart-rate-max-value>
                                </div>
                            </z-stack-item>
                        </z-stack>
                    </div>

                    <div class="data-tile--small wide" id="data-tile--speed">
                        <h2 class="data-tile-small--heading">Speed</h2>
                            <speed-switch id="distance-value"
                                            class="data-tile-small--value">--</speed-switch>
                    </div>
                    <div class="data-tile--small wide" id="data-tile--slope">
                        <h2 class="data-tile-small--heading">Slope</h2>
                        <div class="data-tile-small--value-cont">
                            <slope-target id=slope-target-value"
                                            class="data-tile-small--value">--</slope-target>
                        </div>
                    </div>

                    <div class="data-tile" id="data-tile--target">
                        <z-stack data-key="powerTargetZStack">
                            <z-stack-item class="active">
                                <h2 class="data-tile--heading">Target</h2>
                                <div class="data-tile--value-cont">
                                    <power-target
                                        class="companion-main data-tile--value">
                                        --
                                    </power-target>
                                </div>
                            </z-stack-item>
                            <z-stack-item>
                                <h2 class="data-tile--heading">Target</h2>
                                <div class="data-tile--value-cont complex">
                                    <power-target
                                        class="data-tile--value active">
                                        --
                                    </power-target>
                                    <power-target-ftp
                                        id="power-target-ftp"
                                        class="data-tile-target--value active">
                                        --
                                    </power-ftp-value>
                                </div>
                            </z-stack-item>
                        </z-stack>
                    </div>
                    <div class="data-tile" id="data-tile--elapsed-time">
                        <h2 class="data-tile--heading">Elapsed Time</h2>
                        <div class="data-tile--value-cont">
                            <timer-time id="elapsed-time"
                                        class="data-tile--value">--:--:--</timer-time>
                        </div>
                    </div>
                    <div class="data-tile" id="data-tile--cadence">
                        <z-stack data-key="cadenceZStack">
                            <z-stack-item class="active">
                                <h2 class="data-tile--heading">Cadence</h2>
                                <cadence-value id=cadence-value"
                                                class="data-tile--value">--</cadence-value>
                            </z-stack-item>
                            <z-stack-item>
                                <h2 class="data-tile--heading">Cadence Lap</h2>
                                <cadence-lap-value id=cadence-lap-value"
                                                    class="data-tile--value">--</cadence-lap-value>
                            </z-stack-item>
                            <z-stack-item>
                                <h2 class="data-tile--heading">Cadence Avg</h2>
                                <cadence-avg-value id=cadence-avg-value"
                                                    class="data-tile--value">--</cadence-avg-value>
                            </z-stack-item>
                            <z-stack-item>
                                <h2 class="data-tile--heading">Cadence Target</h2>
                                <cadence-group class="data-tile--value-cont complex">
                                    <cadence-value id=cadence-value"
                                                    class="data-tile--value">--</cadence-value>
                                    <cadence-target id=cadence-target-value"
                                                    class="data-tile-target--value active"></cadence-target>
                                </cadence-group>
                            </z-stack-item>
                        </z-stack>
                    </div>

                </div> <!-- end data-tiles -->
            </div> <!-- end pip-container -->
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