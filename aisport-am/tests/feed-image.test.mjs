import test from "node:test";
import assert from "node:assert/strict";
import { __testExtractImage } from "../lib/feeds.ts";

// The lead photograph on the front page was soft, and the reason was not the
// resizing: the feed offers the same picture at several sizes and the code
// took whichever came first, which is the thumbnail. No amount of resizing
// makes a three-hundred-pixel image sharp at four hundred and seventy.

test("takes the widest image a feed offers, not the first", () => {
  const block = `
    <item>
      <media:thumbnail url="https://cdn.example/thumb.jpg" width="300" height="169" />
      <media:content url="https://cdn.example/large.jpg" width="1600" height="900" type="image/jpeg" />
      <media:content url="https://cdn.example/medium.jpg" width="800" height="450" type="image/jpeg" />
    </item>`;
  assert.equal(__testExtractImage(block), "https://cdn.example/large.jpg");
});

test("reads a size out of the address when the feed declares none", () => {
  const block = `
    <item>
      <media:thumbnail url="https://cdn.example/240x135/photo.jpg" />
      <media:content url="https://cdn.example/1200x675/photo.jpg" />
    </item>`;
  assert.equal(__testExtractImage(block), "https://cdn.example/1200x675/photo.jpg");
});

test("with no sizes at all, an enclosure still beats an inline img", () => {
  const block = `
    <item>
      <description>&lt;img src="https://cdn.example/inline.jpg" /&gt;</description>
      <enclosure url="https://cdn.example/enclosure.jpg" type="image/jpeg" />
    </item>`;
  assert.equal(__testExtractImage(block), "https://cdn.example/enclosure.jpg");
});

test("a non-image enclosure is not mistaken for the picture", () => {
  const block = `
    <item>
      <enclosure url="https://cdn.example/audio.mp3" type="audio/mpeg" />
      <media:thumbnail url="https://cdn.example/thumb.jpg" width="300" />
    </item>`;
  assert.equal(__testExtractImage(block), "https://cdn.example/thumb.jpg");
});

test("an item with no picture at all says so", () => {
  assert.equal(__testExtractImage("<item><title>No picture here</title></item>"), null);
});
