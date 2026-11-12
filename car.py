import pygame
from random import randint
import numpy

pygame.init()

screen = pygame.display.set_mode((400, 600))
pygame.display.set_caption("Ring Dodge Game")

clock = pygame.time.Clock()


def make_cry_sound():
    if pygame.mixer.get_init() is None:
        pygame.mixer.init()
    rate = pygame.mixer.get_init()[0]
    dur = 1.8
    n = int(rate * dur)
    t = numpy.linspace(0, dur, n, endpoint=False)
    # wailing pitch: slow rise/fall "wah wah wah" + fast vibrato
    freq = 480 + 200 * (numpy.sin(2 * numpy.pi * 1.4 * t) * 0.5 + 0.5) + 35 * numpy.sin(2 * numpy.pi * 12 * t)
    phase = numpy.cumsum(2 * numpy.pi * freq / rate)
    # voice-like harmonics
    wave = 0.6 * numpy.sin(phase) + 0.25 * numpy.sin(2 * phase) + 0.1 * numpy.sin(3 * phase)
    # bursty wails + overall decay
    burst = numpy.sin(2 * numpy.pi * 1.4 * t) * 0.5 + 0.5
    envelope = numpy.exp(-t * 0.8) * burst
    wave = numpy.clip(wave * envelope * 0.8, -1, 1)
    wave = numpy.int16(wave * 32767)
    if pygame.mixer.get_init()[2] < 2:  # mono
        wave = wave.reshape(-1, 1)
    else:
        wave = numpy.column_stack((wave, wave))  # stereo
    return pygame.sndarray.make_sound(numpy.ascontiguousarray(wave))


cry_sound = make_cry_sound()


def make_victory_sound():
    if pygame.mixer.get_init() is None:
        pygame.mixer.init()
    rate = pygame.mixer.get_init()[0]
    notes = [523.25, 659.25, 783.99, 1046.50]  # C5 E5 G5 C6
    note_dur = 0.12
    parts = []
    for f in notes:
        n = int(rate * note_dur)
        t = numpy.linspace(0, note_dur, n, endpoint=False)
        env = numpy.minimum(1, t * 40) * numpy.exp(-t * 4)
        wave = 0.6 * numpy.sin(2 * numpy.pi * f * t) + 0.3 * numpy.sin(2 * numpy.pi * f * 2 * t)
        parts.append(wave * env)
    wave = numpy.clip(numpy.concatenate(parts) * 0.8, -1, 1)
    wave = numpy.int16(wave * 32767)
    if pygame.mixer.get_init()[2] < 2:
        wave = wave.reshape(-1, 1)
    else:
        wave = numpy.column_stack((wave, wave))
    return pygame.sndarray.make_sound(numpy.ascontiguousarray(wave))


victory_sound = make_victory_sound()

x = 180

CAR_W, CAR_H = 50, 90


def draw_car(surf, x, y):
    # wheels
    for wx, wy in [(x - 5, y + 12), (x + CAR_W - 5, y + 12),
                   (x - 5, y + CAR_H - 30), (x + CAR_W - 5, y + CAR_H - 30)]:
        pygame.draw.rect(surf, (25, 25, 25), (wx, wy, 10, 18), border_radius=3)

    # body
    pygame.draw.rect(surf, (220, 30, 30), (x, y, CAR_W, CAR_H), border_radius=14)
    pygame.draw.rect(surf, (150, 15, 15), (x, y, CAR_W, CAR_H), border_radius=14, width=2)

    # windshield
    pygame.draw.rect(surf, (150, 200, 235), (x + 8, y + 14, CAR_W - 16, 15), border_radius=4)

    # roof
    pygame.draw.rect(surf, (190, 25, 25), (x + 7, y + 30, CAR_W - 14, 28), border_radius=4)

    # rear window
    pygame.draw.rect(surf, (150, 200, 235), (x + 8, y + 59, CAR_W - 16, 13), border_radius=4)

    # headlights
    pygame.draw.rect(surf, (255, 240, 150), (x + 5, y + 1, 11, 5), border_radius=2)
    pygame.draw.rect(surf, (255, 240, 150), (x + CAR_W - 16, y + 1, 11, 5), border_radius=2)

    # taillights
    pygame.draw.rect(surf, (255, 70, 70), (x + 5, y + CAR_H - 6, 11, 5), border_radius=2)
    pygame.draw.rect(surf, (255, 70, 70), (x + CAR_W - 16, y + CAR_H - 6, 11, 5), border_radius=2)


y = 450

rings = [[randint(0, 360), 150 * i, False] for i in range(4)]

dodged = 0

font = pygame.font.SysFont(None, 60)
small_font = pygame.font.SysFont(None, 24)

crashed = False
flash_timer = 0

running = True

while running:

    for e in pygame.event.get():
        if e.type == pygame.QUIT:
            running = False
        if crashed and e.type == pygame.KEYDOWN and e.key == pygame.K_RETURN:
            crashed = False
            flash_timer = 0
            x, y = 180, 450
            rings = [[randint(0, 360), 150 * i, False] for i in range(4)]
            dodged = 0

    if not crashed:
        if pygame.mouse.get_focused():
            mx, my = pygame.mouse.get_pos()
            x += (mx - CAR_W // 2 - x) * 0.3
            y += (my - CAR_H // 2 - y) * 0.3
            x = max(0, min(350, x))
            y = max(0, min(510, y))

        screen.fill((10, 10, 40))

        draw_car(screen, x, y)

        car_center = (x + CAR_W // 2, y + CAR_H // 2)

        speed = min(18, 6 + dodged * 0.5)

        for r in rings:
            old_y = r[1]
            r[1] = (r[1] + speed) % 600
            if r[1] < old_y:
                # ring wrapped back to the top: move it to a fresh lane so the
                # car can never camp in a permanently safe column
                new_x = randint(0, 360)
                if abs(r[1] - car_center[1]) < 70:
                    tries = 0
                    while abs(new_x - car_center[0]) < 60 and tries < 25:
                        new_x = randint(0, 360)
                        tries += 1
                r[0] = new_x
                dodged += 1
                if dodged % 5 == 0:
                    victory_sound.play()
            pygame.draw.circle(screen, "cyan", (r[0], r[1]), 20, 3)
            closest_x = max(x, min(r[0], x + CAR_W))
            closest_y = max(y, min(r[1], y + CAR_H))
            dx = r[0] - closest_x
            dy = r[1] - closest_y
            if dx * dx + dy * dy <= 20 * 20:
                crashed = True
                flash_timer = 20
                cry_sound.play()

        score = small_font.render(f"Passed: {dodged}", True, "white")
        screen.blit(score, (10, 10))

    else:
        flash_timer = max(0, flash_timer - 1)

        if flash_timer > 0 and flash_timer % 2 == 0:
            screen.fill((255, 255, 255))
        else:
            screen.fill((10, 10, 40))

        text = font.render("Better luck next time", True, (255, 80, 80))
        screen.blit(text, ((400 - text.get_width()) // 2, 260))
        hint = small_font.render("press Enter to retry", True, "white")
        screen.blit(hint, ((400 - hint.get_width()) // 2, 330))

    pygame.display.flip()

    clock.tick(60)

pygame.quit()