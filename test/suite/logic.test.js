const assert = require("assert");
const path = require("path");

const logic = require(path.resolve(__dirname, "../../media/esphome-gpio-pinout-parser"));

suite("Pinout logic", () => {
  test("parses board, variant, psram, substitutions, and pin usage", () => {
    const yaml = [
      "esphome:",
      "  name: test",
      "esp32:",
      "  board: esp32-s3-devkitc-1",
      "  variant: esp32s3",
      "psram:",
      "  mode: octal",
      "substitutions:",
      "  led_pin: GPIO4",
      "binary_sensor:",
      "  - platform: gpio",
      "    pin: ${led_pin}",
      '    name: "Btn"',
    ].join("\n");

    const parsed = logic.parseEsphomeYaml(yaml);
    assert.ok(parsed.ok, "Expected YAML to be detected as ESPHome");
    assert.strictEqual(parsed.board, "esp32-s3-devkitc-1");
    assert.strictEqual(parsed.variant, "esp32s3");
    assert.strictEqual(parsed.psramMode, "octal");

    const usages = parsed.usedPins.get(4);
    assert.ok(usages, "Expected GPIO4 to be detected");
    const pinUsage = usages.find((u) => u.key === "pin");
    assert.ok(pinUsage, "Expected a pin usage entry");
    assert.strictEqual(pinUsage.line, 12);
    assert.strictEqual(pinUsage.platform, "gpio");
  });

  test("parses nested pin.number usage", () => {
    const yaml = [
      "esphome:",
      "  name: test",
      "sensor:",
      "  - platform: dht",
      "    pin:",
      "      number: GPIO14",
      '    name: "DHT"',
    ].join("\n");

    const parsed = logic.parseEsphomeYaml(yaml);
    assert.ok(parsed.ok, "Expected YAML to be detected as ESPHome");

    const usages = parsed.usedPins.get(14);
    assert.ok(usages, "Expected GPIO14 to be detected");
    assert.strictEqual(usages[0].line, 6);
    assert.strictEqual(usages[0].key, "pin");
  });

  test("rejects non-ESPHome YAML", () => {
    const parsed = logic.parseEsphomeYaml("foo: bar\n");
    assert.strictEqual(parsed.ok, false);
  });

  test("detects esp8266 board block", () => {
    const yaml = [
      "esphome:",
      "  name: test",
      "esp8266:",
      "  board: nodemcuv2",
      "binary_sensor:",
      "  - platform: gpio",
      "    pin: GPIO4",
    ].join("\n");

    const parsed = logic.parseEsphomeYaml(yaml);
    assert.ok(parsed.ok, "Expected YAML to be detected as ESPHome");
    assert.strictEqual(parsed.board, "nodemcuv2");
    assert.ok(parsed.usedPins.has(4), "Expected GPIO4 usage to be detected");
  });

  test("detects rp2040 board block", () => {
    const yaml = [
      "esphome:",
      "  name: pico",
      "rp2040:",
      "  board: rpipicow",
      "output:",
      "  - platform: gpio",
      "    pin: GPIO15",
    ].join("\n");

    const parsed = logic.parseEsphomeYaml(yaml);
    assert.ok(parsed.ok, "Expected YAML to be detected as ESPHome");
    assert.strictEqual(parsed.board, "rpipicow");
    assert.ok(parsed.usedPins.has(15), "Expected GPIO15 usage to be detected");
  });

  test("detects nrf52 board and parses P0/P1 pin notation", () => {
    const yaml = [
      "esphome:",
      "  name: xiao-ble",
      "nrf52:",
      "  board: xiao_ble",
      "output:",
      "  - platform: gpio",
      "    pin: P0.26",
      "  - platform: gpio",
      "    pin:",
      "      number: P1.11",
    ].join("\n");

    const parsed = logic.parseEsphomeYaml(yaml);
    assert.ok(parsed.ok, "Expected YAML to be detected as ESPHome");
    assert.strictEqual(parsed.board, "xiao_ble");
    assert.ok(parsed.usedPins.has(26), "Expected P0.26 to map to GPIO26");
    assert.ok(parsed.usedPins.has(43), "Expected P1.11 to map to GPIO43");
  });

  test("resolves board from substitution", () => {
    const yaml = [
      "substitutions:",
      "  my_board: esp32dev",
      "esphome:",
      "  name: test",
      "esp32:",
      "  board: ${my_board}",
    ].join("\n");

    const parsed = logic.parseEsphomeYaml(yaml);
    assert.ok(parsed.ok);
    assert.strictEqual(parsed.board, "esp32dev");
  });

  test("resolves variant from substitution", () => {
    const yaml = [
      "substitutions:",
      "  my_variant: esp32s3",
      "esphome:",
      "  name: test",
      "esp32:",
      "  board: esp32-s3-devkitc-1",
      "  variant: ${my_variant}",
    ].join("\n");

    const parsed = logic.parseEsphomeYaml(yaml);
    assert.ok(parsed.ok);
    assert.strictEqual(parsed.variant, "esp32s3");
  });

  test("unresolved substitution with no digits goes to unresolved list", () => {
    const yaml = [
      "esphome:",
      "  name: test",
      "esp32:",
      "  board: esp32dev",
      "switch:",
      "  - platform: gpio",
      "    pin: ${missing_pin}",
    ].join("\n");

    const parsed = logic.parseEsphomeYaml(yaml);
    assert.ok(parsed.ok);
    // fallback regex extracts nothing useful, so should be unresolved
    assert.strictEqual(parsed.usedPins.size, 0);
    assert.ok(parsed.unresolved.length > 0, "Expected unresolved entry");
  });

  test("guessed pin from unresolved substitution has no substitution source usage", () => {
    const yaml = [
      "esphome:",
      "  name: test",
      "esp32:",
      "  board: esp32dev",
      "switch:",
      "  - platform: gpio",
      "    pin: ${relay_2_pin}",
    ].join("\n");

    const parsed = logic.parseEsphomeYaml(yaml);
    assert.ok(parsed.ok);
    const usages = parsed.usedPins.get(2);
    assert.ok(usages, "Expected GPIO2 from fallback digit extraction");
    assert.ok(usages.some((u) => u.isGuessed), "Expected isGuessed flag");
    assert.strictEqual(usages.length, 1, "Should only have one usage (no substitution source)");
    assert.ok(!usages.some((u) => u.section === "substitutions"), "Should not have substitution source for unresolved sub");
  });

  test("marks pin as guessed for bare non-GPIO string with digit", () => {
    const yaml = [
      "esphome:",
      "  name: test",
      "esp32:",
      "  board: esp32dev",
      "switch:",
      "  - platform: gpio",
      "    pin:",
      "      number: pin_no_20",
    ].join("\n");

    const parsed = logic.parseEsphomeYaml(yaml);
    assert.ok(parsed.ok);
    const usages = parsed.usedPins.get(20);
    assert.ok(usages, "Expected GPIO20 from fallback digit extraction");
    assert.ok(usages.some((u) => u.isGuessed), "Expected isGuessed flag");
  });

  test("does not pick up _pin keys inside substitutions block as pin usages", () => {
    const yaml = [
      "substitutions:",
      "  relay_pin: GPIO5",
      "esphome:",
      "  name: test",
      "esp32:",
      "  board: esp32dev",
    ].join("\n");

    const parsed = logic.parseEsphomeYaml(yaml);
    assert.ok(parsed.ok);
    assert.strictEqual(parsed.usedPins.size, 0, "Substitution definitions should not count as pin usages");
  });

  test("adds substitution source as secondary usage when pin resolves via sub", () => {
    const yaml = [
      "substitutions:",
      "  relay_pin: GPIO5",
      "esphome:",
      "  name: test",
      "esp32:",
      "  board: esp32dev",
      "switch:",
      "  - platform: gpio",
      "    pin: ${relay_pin}",
    ].join("\n");

    const parsed = logic.parseEsphomeYaml(yaml);
    assert.ok(parsed.ok);
    const usages = parsed.usedPins.get(5);
    assert.ok(usages, "Expected GPIO5");
    assert.ok(usages.length >= 2, "Expected at least 2 usages (pin + substitution source)");
    const subUsage = usages.find((u) => u.section === "substitutions");
    assert.ok(subUsage, "Expected a usage from substitutions section");
    assert.strictEqual(subUsage.line, 2);
    assert.strictEqual(subUsage.key, "relay_pin");
  });

  test("detects unused GPIO substitutions", () => {
    const yaml = [
      "substitutions:",
      "  used_pin: GPIO4",
      "  unused_pin: GPIO5",
      "esphome:",
      "  name: test",
      "esp32:",
      "  board: esp32dev",
      "switch:",
      "  - platform: gpio",
      "    pin: ${used_pin}",
    ].join("\n");

    const parsed = logic.parseEsphomeYaml(yaml);
    assert.ok(parsed.ok);
    assert.ok(parsed.usedPins.has(4), "Expected GPIO4 to be used");
    assert.ok(!parsed.usedPins.has(5), "Expected GPIO5 to not be used");
    assert.ok(parsed.unusedGpioSubstitutions.length === 1);
    assert.strictEqual(parsed.unusedGpioSubstitutions[0].key, "unused_pin");
    assert.strictEqual(parsed.unusedGpioSubstitutions[0].gpio, 5);
  });

  test("does not flag non-pin substitutions as unused GPIOs", () => {
    const yaml = [
      "substitutions:",
      "  ota_password: secret123",
      "  board_name: esp32dev",
      "esphome:",
      "  name: test",
      "esp32:",
      "  board: esp32dev",
    ].join("\n");

    const parsed = logic.parseEsphomeYaml(yaml);
    assert.ok(parsed.ok);
    assert.strictEqual(parsed.unusedGpioSubstitutions.length, 0, "Non-pin subs should not appear as unused GPIOs");
  });

  test("nested pin with substitution resolves and adds sub source usage", () => {
    const yaml = [
      "substitutions:",
      "  my_pin: GPIO3",
      "esphome:",
      "  name: test",
      "esp32:",
      "  board: esp32dev",
      "switch:",
      "  - platform: gpio",
      "    pin:",
      "      number: ${my_pin}",
    ].join("\n");

    const parsed = logic.parseEsphomeYaml(yaml);
    assert.ok(parsed.ok);
    const usages = parsed.usedPins.get(3);
    assert.ok(usages, "Expected GPIO3");
    const pinUsage = usages.find((u) => u.key === "pin");
    assert.ok(pinUsage, "Expected pin usage");
    assert.strictEqual(pinUsage.line, 10);
    const subUsage = usages.find((u) => u.section === "substitutions");
    assert.ok(subUsage, "Expected substitution source usage");
    assert.strictEqual(subUsage.line, 2);
  });

  test("backfills name/id for ultrasonic trigger/echo pins", () => {
    const yaml = [
      "esphome:",
      "  name: test",
      "esp32:",
      "  board: esp32dev",
      "sensor:",
      "  - platform: ultrasonic",
      "    trigger_pin: GPIO2",
      "    id: parking_distance",
      "    echo_pin: GPIO1",
      '    name: "Parking Distance Ultrasonic Sensor"',
      "    update_interval: 5s",
    ].join("\n");

    const parsed = logic.parseEsphomeYaml(yaml);
    assert.ok(parsed.ok, "Expected YAML to be detected as ESPHome");

    const trigger = (parsed.usedPins.get(2) || []).find((u) => u.key === "trigger_pin");
    const echo = (parsed.usedPins.get(1) || []).find((u) => u.key === "echo_pin");

    assert.ok(trigger, "Expected trigger_pin usage on GPIO2");
    assert.ok(echo, "Expected echo_pin usage on GPIO1");

    assert.strictEqual(trigger.line, 7);
    assert.strictEqual(echo.line, 9);
    assert.strictEqual(trigger.id, "parking_distance");
    assert.strictEqual(echo.id, "parking_distance");
    assert.strictEqual(trigger.name, "Parking Distance Ultrasonic Sensor");
    assert.strictEqual(echo.name, "Parking Distance Ultrasonic Sensor");
  });
});
