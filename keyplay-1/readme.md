# KeyTagPlayer

## live Demo 

* [Live DEMO link](./index.html)


## Overview

This project is a kiosk site designed for a museum installation. It plays videos based on RFID tags and MIDI Note On events. The site includes a hidden debug mode for testing and configuration.
Features

* Standby mode with a fading text label.
* Play videos based on RFID tag input.
* Crossfade transitions between videos.
* MIDI Note On event triggers for video playback.
* Debug mode for testing and configuration.

## Requirements

* HTML5
* CSS3
* JavaScript (ES6+)
* WebMIDI API
* Web Audio API

## Installation

* Clone the repository to your local machine.
* Ensure you have a web server to serve the HTML file.
* Open index.html in your preferred web server.

## File Structure

* index.html: The main HTML file for the kiosk site.
* styles.css: The CSS file for styling the kiosk site.
* script.js: The JavaScript file for handling the logic and interactions.
* rfidDatabase.json: The external JSON file containing RFID tags and associated videos.

## Usage

### Standby Mode

* The site starts in standby mode, displaying a fading text label.

### Playing Videos

* Videos are played based on RFID tag input or MIDI Note On events.
* RFID input is captured as fast bursts of keyboard input.
* The system checks if the video file exists before attempting to play it.

### Crossfade Transitions

* Smooth crossfade transitions between videos, including audio crossfade.

### Debug Mode

* Enable debug mode by pressing Ctrl + Shift + D.
* Simulate RFID input with on-screen buttons.
* Log all incoming keystrokes.
* Toggle video controls and information overlay.
* Enable/disable MIDI input.
* Select MIDI device input.
* Control master volume.

### JSON Configuration

Example structure of rfidDatabase.json:

```json

{
  "1": {
    "keytag": ["11111"],
    "videos": ["media/lorem/ipsum_010.mp4", "media/lorem/ipsum_011.mp4", "media/lorem/ipsum_012.mp4", "media/lorem/ipsum_013.mp4", "media/lorem/ipsum_014.mp4"],
    "name": "Tag 11111",
    "caption": "This is the caption for Tag 11111",
    "NoteOnMidiMap": 32
  },
  ...
}
```

* keytag: Array of RFID tags associated with the videos.
* videos: Array of video file paths.
* name: Name of the tag.
* caption: Caption for the tag.
* NoteOnMidiMap: MIDI Note On value for triggering the video.

### State Machine

* StandbyMode: Display standby screen.
* LoadingVideo: Check and load video file.
* PlayingVideo: Play the loaded video.
* Crossfading: Crossfade between two videos.

### Transitions

* StandbyMode to LoadingVideo on Start Video.
* LoadingVideo to PlayingVideo on Video Loaded.
* PlayingVideo to StandbyMode on Video Ended.
* PlayingVideo to Crossfading on Start Crossfade.
* Crossfading to PlayingVideo on Crossfade Complete.

### Error Handling

* If the video file is not found, log an error and return to standby mode.

## License

This project is licensed under the MIT License.


