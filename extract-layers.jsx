// extract-layers.jsx
// A Photoshop script to export each layer of a PSD as a separate high-resolution PNG file.

#target photoshop

function main() {
    // Check if a document is open
    if (app.documents.length <= 0) {
        alert("Please open a Photoshop document before running this script.");
        return;
    }

    var doc = app.activeDocument;

    // Ask user for an output folder
    var outputFolder = Folder.selectDialog("Select a folder to save the exported layers");
    if (outputFolder == null) {
        // User cancelled
        return;
    }

    // Create a subfolder based on the PSD name to keep things organized
    var psdName = doc.name.replace(/\.[^\.]+$/, '');
    var layerFolder = new Folder(outputFolder + "/" + psdName + "_layers");
    if (!layerFolder.exists) {
        layerFolder.create();
    }

    // --- Save original layer states and then hide all layers ---
    var layerStates = [];
    for (var i = 0; i < doc.layers.length; i++) {
        layerStates.push({
            layer: doc.layers[i],
            visible: doc.layers[i].visible
        });
        doc.layers[i].visible = false;
    }

    // --- Export each layer one by one ---
    for (var j = 0; j < layerStates.length; j++) {
        var currentLayer = layerStates[j].layer;
        
        // Skip background layers as they can cause issues with transparency
        if (currentLayer.isBackgroundLayer) continue;

        currentLayer.visible = true; // Show only the current layer

        // Sanitize layer name for the filename
        var layerName = currentLayer.name.replace(/[\/\\:*?"<>|]/g, '_');
        var saveFile = new File(layerFolder + "/" + layerName + ".png");

        // Set PNG save options for high quality with transparency
        var pngSaveOptions = new PNGSaveOptions();
        pngSaveOptions.compression = 9; // 0 (fast) to 9 (slowest)
        pngSaveOptions.interlaced = false;

        // Save the document as a PNG
        doc.saveAs(saveFile, pngSaveOptions, true, Extension.LOWERCASE);

        currentLayer.visible = false; // Hide the layer again
    }

    // --- Restore original layer visibility ---
    for (var k = 0; k < layerStates.length; k++) {
        layerStates[k].layer.visible = layerStates[k].visible;
    }

    alert("Layer export complete!\nFiles saved in: " + layerFolder.fsName);
}

// Run the main function
main();
