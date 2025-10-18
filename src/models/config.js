
class Config {
    #defaultStravaClientId = 0;
    #defaultIntervalsClientId = 0;
    #defaultTrainingPeaksClientId = 0;

    constructor() {
        // Check if this is a self-hosted deployment (not auuki.com)
        const isSelfHosted = !window.location.hostname.includes('auuki.com');

        this.env = {
            // PWA_URI: "http://localhost:1234",
            // API_URI: "http://localhost:8080",
            PWA_URI: window.location.origin ?? "https://auuki.com",
            API_URI: "https://api.auuki.com", // Keep API enabled, handle CORS gracefully
            STRAVA_CLIENT_ID: this.defaultStravaClientId,
            INTERVALS_CLIENT_ID: this.defaultIntervalsClientId,
            TRAINING_PEAKS_CLIENT_ID: this.defaultTrainingPeaksClientId,
            SELF_HOSTED: isSelfHosted,
        };
    }
    setServices(args = {}) {
        this.env.STRAVA_CLIENT_ID = args.strava ?? this.defaultStravaClientId;
        this.env.INTERVALS_CLIENT_ID = args.intervals ?? this.defaultIntervalsClientId;
        this.env.TRAINING_PEAKS_CLIENT_ID = args.trainingPeaks ?? this.defaultTrainingPeaksClientId;
    }
    get() {
        return this.env;
    }
}

const config = new Config();

export default config;
