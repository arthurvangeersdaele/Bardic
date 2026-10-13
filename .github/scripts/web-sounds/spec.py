# Sound plan for the Bardic web edition.
# Each entry: destination (relative to docs/play/sounds) -> recipe
#   ("one", source, filter)            single source, optional ffmpeg -af filter
#   ("mix", [sources], filter_complex) several sources mixed into one (output label [out])
# Sources: "W:" Wesnoth data/core/, "WC:" Wesnoth data/campaigns/, "Z:" 0 A.D. public/audio/, "F:" Flare mods/fantasycore/

LP_UNDER = "lowpass=f=420,lowpass=f=420,volume=2.2"   # muffled, heard from underwater
DOWN = lambda r: f"asetrate=44100*{r},aresample=44100"  # pitch + speed down

PLAN = {
 # ---------------- The Forest Adventure ----------------
 "forest/1-in-the-forest/music/01_forest-theme.mp3": ("one", "F:music/forest_theme.ogg", None),
 "forest/1-in-the-forest/music/02_silvan-sanctuary.mp3": ("one", "W:music/silvan_sanctuary.ogg", None),
 "forest/1-in-the-forest/ambience/01_forest-at-day.mp3": ("one", "Z:ambient/dayscape/day_temperate_gen_01.ogg", None),
 "forest/1-in-the-forest/ambience/02_birdsong.mp3": ("one", "F:soundfx/environment/bird_twitter_loop.ogg", None),
 "forest/1-in-the-forest/ambience/03_wind-in-the-leaves.mp3": ("one", "Z:ambient/weather/windleaves_10.ogg", None),
 "forest/1-in-the-forest/events/01_wolf-growl.mp3": ("one", "W:sounds/wolf-growl-2.ogg", None),
 "forest/1-in-the-forest/events/02_raven-calls.mp3": ("one", "F:soundfx/environment/raven_loop.ogg", None),
 "forest/1-in-the-forest/events/03_owl-hoots.mp3": ("one", "F:soundfx/environment/forest_owl_loop.ogg", None),

 "forest/2-fight-with-a-bear/music/01_battle-theme.mp3": ("one", "F:music/battle_theme.ogg", None),
 "forest/2-fight-with-a-bear/music/02_frantic.mp3": ("one", "W:music/frantic.ogg", None),
 "forest/2-fight-with-a-bear/ambience/01_heartbeat.mp3": ("one", "F:soundfx/heartbeat.ogg", None),
 "forest/2-fight-with-a-bear/ambience/02_restless-wind.mp3": ("one", "F:soundfx/environment/wind_loop.ogg", None),
 "forest/2-fight-with-a-bear/events/01_bear-roar.mp3": ("one", "Z:actor/fauna/animal/lion_attack1.ogg", DOWN(0.72)),
 "forest/2-fight-with-a-bear/events/02_bear-growl.mp3": ("one", "W:sounds/yeti-hit.ogg", DOWN(0.8)),
 "forest/2-fight-with-a-bear/events/03_claw-swipe.mp3": ("one", "W:sounds/claws.ogg", None),
 "forest/2-fight-with-a-bear/events/04_sword-strike.mp3": ("one", "Z:attack/weapon/swordhit_12.ogg", None),
 "forest/2-fight-with-a-bear/events/05_the-bear-falls.mp3": ("one", "W:sounds/yeti-die.ogg", DOWN(0.8)),

 "forest/3-a-night-at-the-pub/music/01_tavern-in-the-mist.mp3": ("one", "Z:music/Tavern_in_the_Mist.ogg", None),
 "forest/3-a-night-at-the-pub/music/02_traveling-minstrels.mp3": ("one", "W:music/traveling_minstrels.ogg", None),
 "forest/3-a-night-at-the-pub/ambience/01_busy-tavern.mp3": ("one", "Z:ambient/building/amb_trade_10.ogg", None),
 "forest/3-a-night-at-the-pub/ambience/02_fireplace.mp3": ("one", "W:sounds/ambient/campfire.ogg", None),
 "forest/3-a-night-at-the-pub/events/01_door-opens.mp3": ("one", "F:soundfx/door_open.ogg", None),
 "forest/3-a-night-at-the-pub/events/02_coins-on-the-table.mp3": ("one", "F:soundfx/inventory/inventory_coins.ogg", None),
 "forest/3-a-night-at-the-pub/events/03_hearty-laugh.mp3": ("one", "W:sounds/dwarf-laugh.wav", None),
 "forest/3-a-night-at-the-pub/events/04_bar-fight-punch.mp3": ("one", "W:sounds/fist.ogg", None),
 "forest/3-a-night-at-the-pub/events/05_bottle.mp3": ("one", "F:soundfx/inventory/inventory_potion.ogg", None),

 "forest/4-the-human-village/music/01_town-theme.mp3": ("one", "F:music/town_theme.ogg", None),
 "forest/4-the-human-village/music/02_harvest-festival.mp3": ("one", "Z:music/Harvest_Festival.ogg", None),
 "forest/4-the-human-village/ambience/01_village-market.mp3": ("one", "Z:ambient/building/amb_trade_11.ogg", None),
 "forest/4-the-human-village/ambience/02_farmyard.mp3": ("one", "Z:ambient/building/amb_farm_10.ogg", None),
 "forest/4-the-human-village/ambience/03_blacksmith-at-work.mp3": ("one", "F:soundfx/environment/anvil_loop.ogg", None),
 "forest/4-the-human-village/events/01_church-bell.mp3": ("one", "WC:The_Deceivers_Gambit/sounds/bell.ogg", None),
 "forest/4-the-human-village/events/02_horse-passes.mp3": ("one", "W:sounds/horse-canter.wav", None),
 "forest/4-the-human-village/events/03_dog-barks.mp3": ("one", "Z:voice/global/civ_dog_bark.ogg", None),
 "forest/4-the-human-village/events/04_chickens.mp3": ("one", "Z:actor/fauna/animal/chicken_10.ogg", None),

 # ---------------- The Big War ----------------
 "big-war/1-the-soldier-training-camp/music/01_loyalists.mp3": ("one", "W:music/loyalists.ogg", None),
 "big-war/1-the-soldier-training-camp/music/02_honor-bound.mp3": ("one", "Z:music/Honor_Bound.ogg", None),
 "big-war/1-the-soldier-training-camp/ambience/01_training-yard.mp3": ("mix", ["Z:ambient/dayscape/day_temperate_13.ogg", "Z:attack/weapon/sword_attack_01.ogg", "Z:attack/impact/shield_wood_03.ogg", "Z:attack/weapon/pike_attack_02.ogg", "Z:attack/impact/shield_metal_05.ogg", "Z:attack/weapon/sword_attack_07.ogg"],
     "[0]volume=0.8[a0];[1]adelay=1500:all=1,volume=0.5[a1];[2]adelay=4200:all=1,volume=0.5[a2];[3]adelay=7300:all=1,volume=0.45[a3];[4]adelay=11000:all=1,volume=0.45[a4];[5]adelay=15500:all=1,volume=0.5[a5];"
     "[a0][a1][a2][a3][a4][a5]amix=inputs=6:duration=first:normalize=0[out]"),
 "big-war/1-the-soldier-training-camp/ambience/02_war-drums.mp3": ("one", "W:sounds/ambient/wardrums.ogg", None),
 "big-war/1-the-soldier-training-camp/events/01_horn-signal.mp3": ("one", "W:sounds/horn-signals/horn-1.ogg", None),
 "big-war/1-the-soldier-training-camp/events/02_sword-drill.mp3": ("mix", ["Z:attack/weapon/swordhit_10.ogg", "Z:attack/weapon/swordhit_13.ogg", "Z:attack/weapon/swordhit_15.ogg", "Z:attack/weapon/swordhit_17.ogg"],
     "[1]adelay=550:all=1[b];[2]adelay=1100:all=1[c];[3]adelay=1900:all=1[d];[0][b][c][d]amix=inputs=4:duration=longest:normalize=0[out]"),
 "big-war/1-the-soldier-training-camp/events/03_archery-practice.mp3": ("mix", ["Z:attack/weapon/bow_attack_02.ogg", "Z:attack/impact/arrow_wood_05.ogg"],
     "[1]adelay=700:all=1[b];[0][b]amix=inputs=2:duration=longest:normalize=0[out]"),
 "big-war/1-the-soldier-training-camp/events/04_cavalry-gallop.mp3": ("one", "W:sounds/horse-elf-canter.wav", None),

 "big-war/2-let-the-army-walk/music/01_legends-of-the-north.mp3": ("one", "W:music/legends_of_the_north.ogg", None),
 "big-war/2-let-the-army-walk/music/02_northern-frontier.mp3": ("one", "Z:music/Northern_Frontier.ogg", None),
 "big-war/2-let-the-army-walk/ambience/01_marching-army.mp3": ("mix", ["Z:actor/human/movement/Footsteps/Footstep_Gravel_Walking.ogg", "Z:actor/human/movement/Footsteps/Footstep_Gravel_Walking.ogg", "Z:actor/human/movement/Footsteps/Footstep_Grass_Walking.ogg", "Z:ambient/weather/wind_11.ogg"],
     "[0]aloop=loop=-1:size=2e9,atrim=0:40[a];[1]aloop=loop=-1:size=2e9,atrim=0:40,adelay=180:all=1,volume=0.8[b];[2]aloop=loop=-1:size=2e9,atrim=0:40,adelay=330:all=1,volume=0.7[c];[3]aloop=loop=-1:size=2e9,atrim=0:40,volume=0.5[d];"
     "[a][b][c][d]amix=inputs=4:duration=shortest:normalize=0,atrim=0:36[out]"),
 "big-war/2-let-the-army-walk/ambience/02_war-drums-on-the-road.mp3": ("one", "W:sounds/ambient/wardrums.ogg", "atempo=0.9"),
 "big-war/2-let-the-army-walk/events/01_horn-call.mp3": ("one", "W:sounds/horn-signals/horn-4.ogg", None),
 "big-war/2-let-the-army-walk/events/02_siege-engines-roll.mp3": ("one", "Z:attack/siege/onager_moving_11.ogg", None),
 "big-war/2-let-the-army-walk/events/03_supply-carts.mp3": ("one", "Z:attack/siege/ram_move.ogg", None),

 "big-war/3-the-fight/music/01_battle-epic.mp3": ("one", "W:music/battle-epic.ogg", None),
 "big-war/3-the-fight/music/02_the-dangerous-symphony.mp3": ("one", "W:music/the_dangerous_symphony.ogg", None),
 "big-war/3-the-fight/ambience/01_battle-melee.mp3": ("mix",
     ["Z:attack/weapon/swordhit_11.ogg", "Z:attack/weapon/swordhit_14.ogg", "Z:attack/weapon/swordhit_16.ogg", "Z:attack/impact/shield_metal_02.ogg", "Z:attack/weapon/swordhit_18.ogg",
      "W:sounds/human-hit-2.ogg", "W:sounds/human-die-2.ogg", "Z:attack/impact/shield_wood_09.ogg", "Z:attack/weapon/swordhit_19.ogg", "W:sounds/orc-hit-3.ogg", "Z:attack/weapon/arrowfly_03.ogg", "Z:ambient/weather/wind_11.ogg"],
     "[0]adelay=200:all=1[a];[1]adelay=900:all=1,volume=0.8[b];[2]adelay=1700:all=1[c];[3]adelay=2300:all=1,volume=0.7[d];[4]adelay=3400:all=1[e];[5]adelay=3900:all=1,volume=0.6[f];"
     "[6]adelay=5200:all=1,volume=0.5[g];[7]adelay=6100:all=1,volume=0.7[h];[8]adelay=7000:all=1,volume=0.9[i];[9]adelay=8200:all=1,volume=0.6[j];[10]adelay=9100:all=1,volume=0.6[k];[11]atrim=0:11,volume=0.6[l];"
     "[a][b][c][d][e][f][g][h][i][j][k][l]amix=inputs=12:duration=longest:normalize=0,atrim=0:10.5,afade=t=in:d=0.15,afade=t=out:st=10.2:d=0.3[out]"),
 "big-war/3-the-fight/ambience/02_arrow-storm.mp3": ("mix", ["Z:attack/weapon/arrowfly_01.ogg", "Z:attack/weapon/arrowfly_05.ogg", "Z:attack/weapon/arrowfly_08.ogg", "Z:attack/impact/arrow_dirt_04.ogg", "Z:attack/impact/arrow_wood_11.ogg", "Z:attack/impact/arrow_metal_06.ogg"],
     "[1]adelay=600:all=1[b];[2]adelay=1300:all=1[c];[3]adelay=900:all=1[d];[4]adelay=1700:all=1[e];[5]adelay=2300:all=1[f];[0][b][c][d][e][f]amix=inputs=6:duration=longest:normalize=0[out]"),
 "big-war/3-the-fight/events/01_charge-horn.mp3": ("one", "W:sounds/horn-signals/horn-3.ogg", None),
 "big-war/3-the-fight/events/02_war-cry.mp3": ("one", "F:soundfx/powers/warcry.ogg", None),
 "big-war/3-the-fight/events/03_catapult-launch.mp3": ("one", "Z:attack/siege/onager_shooting_11.ogg", None),
 "big-war/3-the-fight/events/04_boulder-impact.mp3": ("one", "Z:attack/impact/siegeprojectilehit_02.ogg", None),
 "big-war/3-the-fight/events/05_explosion.mp3": ("one", "W:sounds/explosion.ogg", None),
 "big-war/3-the-fight/events/06_tower-collapses.mp3": ("one", "Z:attack/destruction/building_collapse_large_01.ogg", None),

 "big-war/4-the-general-dies/music/01_the-king-is-dead.mp3": ("one", "W:music/the_king_is_dead.ogg", None),
 "big-war/4-the-general-dies/music/02_hill-of-sorrows.mp3": ("one", "Z:music/Hill_of_Sorrows.ogg", None),
 "big-war/4-the-general-dies/ambience/01_distant-battle.mp3": ("one", "W:sounds/ambient/wardrums.ogg", "lowpass=f=600,volume=0.8"),
 "big-war/4-the-general-dies/ambience/02_cold-wind.mp3": ("one", "WC:Winds_of_Fate/sounds/wind.wav", None),
 "big-war/4-the-general-dies/ambience/03_crows.mp3": ("one", "F:soundfx/environment/raven_loop.ogg", "volume=0.7"),
 "big-war/4-the-general-dies/events/01_the-general-falls.mp3": ("one", "W:sounds/human-old-die-1.ogg", None),
 "big-war/4-the-general-dies/events/02_his-horse-falls.mp3": ("one", "W:sounds/horse-die.ogg", None),
 "big-war/4-the-general-dies/events/03_horn-of-mourning.mp3": ("one", "W:sounds/horn-signals/horn-8.ogg", "atempo=0.85"),

 "big-war/5-the-battle-ends/music/01_you-are-victorious.mp3": ("one", "Z:music/You_are_Victorious!.ogg", None),
 "big-war/5-the-battle-ends/music/02_elysian-fields.mp3": ("one", "Z:music/Elysian_Fields.ogg", None),
 "big-war/5-the-battle-ends/ambience/01_battlefield-at-dusk.mp3": ("one", "Z:ambient/weather/wind_11.ogg", None),
 "big-war/5-the-battle-ends/ambience/02_light-rain.mp3": ("one", "Z:ambient/weather/rain_11.ogg", None),
 "big-war/5-the-battle-ends/events/01_victory-fanfare.mp3": ("one", "W:sounds/fanfare-short.wav", None),
 "big-war/5-the-battle-ends/events/02_the-gate-falls.mp3": ("one", "WC:Heir_To_The_Throne/sounds/gate-fall.ogg", None),
 "big-war/5-the-battle-ends/events/03_wounded-groan.mp3": ("one", "W:sounds/groan.wav", None),
 "big-war/5-the-battle-ends/events/04_cheering-horns.mp3": ("one", "W:sounds/horn-signals/horn-6.ogg", None),

 # ---------------- Underwater Adventure ----------------
 "underwater/1-chill-on-the-beach/music/01_mediterranean-waves.mp3": ("one", "Z:music/Mediterranean_Waves.ogg", None),
 "underwater/1-chill-on-the-beach/music/02_waters-edge.mp3": ("one", "Z:music/Water's_Edge.ogg", None),
 "underwater/1-chill-on-the-beach/ambience/01_gentle-waves.mp3": ("one", "Z:ambient/water/wave_21.ogg", None),
 "underwater/1-chill-on-the-beach/ambience/02_tropical-day.mp3": ("one", "Z:ambient/dayscape/day_tropical_10.ogg", None),
 "underwater/1-chill-on-the-beach/events/01_footsteps-in-the-sand.mp3": ("one", "Z:actor/human/movement/Footsteps/Foorstep_Sand_Walking.ogg", None),
 "underwater/1-chill-on-the-beach/events/02_splash.mp3": ("one", "WC:Heir_To_The_Throne/sounds/water.wav", None),
 "underwater/1-chill-on-the-beach/events/03_ship-horn-far-away.mp3": ("one", "W:sounds/horn-signals/horn-5.ogg", "lowpass=f=1800,volume=0.7"),

 "underwater/2-its-a-tsunami/music/01_point-of-no-return.mp3": ("one", "Z:music/Point_of_No_Return.ogg", None),
 "underwater/2-its-a-tsunami/music/02_suspense.mp3": ("one", "W:music/suspense.ogg", None),
 "underwater/2-its-a-tsunami/ambience/01_raging-sea.mp3": ("mix", ["Z:ambient/water/wavecrash_21.ogg", "Z:ambient/water/river_raging_21.ogg"],
     "[0]volume=0.9[a];[1]volume=0.7[b];[a][b]amix=inputs=2:duration=shortest:normalize=0[out]"),
 "underwater/2-its-a-tsunami/ambience/02_storm-winds.mp3": ("one", "Z:ambient/weather/windstorm_11.ogg", None),
 "underwater/2-its-a-tsunami/events/01_earthquake-rumble.mp3": ("one", "W:sounds/rumble.ogg", None),
 "underwater/2-its-a-tsunami/events/02_the-giant-wave.mp3": ("mix", ["W:sounds/rumble.ogg", "Z:ambient/water/wavecrash_21.ogg", "Z:ambient/weather/windgust_11.ogg", "W:sounds/water-blast.wav"],
     "[0]volume=1.0[a];[1]atrim=0:9,afade=t=in:d=2.5,afade=t=out:st=7:d=2,volume=1.3[b];[2]atrim=0:9,afade=t=in:d=1.5,volume=0.8[c];[3]adelay=3500:all=1,volume=1.0[d];"
     "[a][b][c][d]amix=inputs=4:duration=longest:normalize=0,atrim=0:10[out]"),
 "underwater/2-its-a-tsunami/events/03_thunder.mp3": ("one", "Z:ambient/weather/thunder_10.ogg", None),
 "underwater/2-its-a-tsunami/events/04_panic-scream.mp3": ("one", "W:sounds/human-female-hit-2.ogg", None),

 "underwater/3-discovering-the-underwater-world/music/01_the-deep-path.mp3": ("one", "W:music/the_deep_path.ogg", None),
 "underwater/3-discovering-the-underwater-world/music/02_mirage.mp3": ("one", "Z:music/Mirage.ogg", None),
 "underwater/3-discovering-the-underwater-world/ambience/01_deep-water.mp3": ("one", "Z:ambient/water/river_slow_21.ogg", LP_UNDER),
 "underwater/3-discovering-the-underwater-world/ambience/02_ocean-current.mp3": ("one", "Z:ambient/water/waverocky_21.ogg", "lowpass=f=300,lowpass=f=300,volume=2.5"),
 "underwater/3-discovering-the-underwater-world/events/01_bubbles.mp3": ("one", "WC:The_Deceivers_Gambit/sounds/sylph-orb-water.wav", None),
 "underwater/3-discovering-the-underwater-world/events/02_mermaid-call.mp3": ("one", "W:sounds/mermaid-hit.ogg", "aecho=0.8:0.85:400|700:0.4|0.25"),
 "underwater/3-discovering-the-underwater-world/events/03_something-huge-swims-by.mp3": ("one", "W:sounds/rumble.ogg", DOWN(0.6) + ",lowpass=f=250,volume=1.6"),

 "underwater/4-the-pirates-ship/music/01_three-sheets.mp3": ("one", "W:music/three-sheets.ogg", None),
 "underwater/4-the-pirates-ship/music/02_bandit-country.mp3": ("one", "Z:music/Bandit_Country.ogg", None),
 "underwater/4-the-pirates-ship/ambience/01_creaking-ship.mp3": ("one", "W:sounds/ambient/ship.ogg", None),
 "underwater/4-the-pirates-ship/ambience/02_harbor.mp3": ("one", "Z:ambient/building/amb_port_10.ogg", None),
 "underwater/4-the-pirates-ship/events/01_cannon-fire.mp3": ("one", "W:sounds/explosion.ogg", DOWN(0.75) + ",lowpass=f=2500"),
 "underwater/4-the-pirates-ship/events/02_cutlass-clash.mp3": ("one", "Z:attack/weapon/swordhit_16.ogg", None),
 "underwater/4-the-pirates-ship/events/03_ramming-speed.mp3": ("one", "W:sounds/ship-ram-windup.ogg", None),
 "underwater/4-the-pirates-ship/events/04_treasure-chest.mp3": ("one", "W:sounds/open-chest.wav", None),
 "underwater/4-the-pirates-ship/events/05_musket-shot.mp3": ("one", "Z:attack/weapon/Musket_1.ogg", None),

 "underwater/5-the-kraken-is-attacking-us/music/01_weight-of-revenge.mp3": ("one", "W:music/weight_of_revenge.ogg", None),
 "underwater/5-the-kraken-is-attacking-us/music/02_undead-siege.mp3": ("one", "W:music/undead_siege.ogg", None),
 "underwater/5-the-kraken-is-attacking-us/ambience/01_storm-at-sea.mp3": ("mix", ["Z:ambient/weather/rain_12.ogg", "Z:ambient/water/waverocky_21.ogg"],
     "[0]volume=0.8[a];[1]volume=0.8[b];[a][b]amix=inputs=2:duration=shortest:normalize=0[out]"),
 "underwater/5-the-kraken-is-attacking-us/ambience/02_hull-under-strain.mp3": ("one", "W:sounds/ambient/ship.ogg", DOWN(0.8)),
 "underwater/5-the-kraken-is-attacking-us/events/01_Kraken-roar.mp3": ("mix", ["Z:actor/fauna/attack/lion2.ogg", "W:sounds/hiss-big.wav", "W:sounds/rumble.ogg"],
     "[0]" + DOWN(0.55) + ",volume=1.3[a];[1]" + DOWN(0.6) + ",adelay=150:all=1,volume=0.7[b];[2]atrim=0:4,volume=0.6[c];[a][b][c]amix=inputs=3:duration=longest:normalize=0[out]"),
 "underwater/5-the-kraken-is-attacking-us/events/02_tentacle-slam.mp3": ("mix", ["Z:attack/impact/siegeprojectilehit_03.ogg", "W:sounds/water-blast.wav"],
     "[0]" + DOWN(0.8) + "[a];[1]adelay=80:all=1[b];[a][b]amix=inputs=2:duration=longest:normalize=0[out]"),
 "underwater/5-the-kraken-is-attacking-us/events/03_the-hull-breaks.mp3": ("one", "Z:actor/ship/warship_death_01.ogg", None),
 "underwater/5-the-kraken-is-attacking-us/events/04_man-overboard.mp3": ("mix", ["W:sounds/human-die-3.ogg", "WC:Heir_To_The_Throne/sounds/water.wav"],
     "[1]adelay=600:all=1[b];[0][b]amix=inputs=2:duration=longest:normalize=0[out]"),
 "underwater/5-the-kraken-is-attacking-us/events/05_the-Kraken-dies.mp3": ("one", "W:sounds/hiss-die.wav", DOWN(0.55) + ",volume=1.4"),

 # ---------------- Soundbox (shared) ----------------
 "soundbox/01_critical-hit.mp3": ("one", "Z:attack/weapon/swordhit_13.ogg", None),
 "soundbox/02_level-up.mp3": ("one", "F:soundfx/level_up.ogg", None),
 "soundbox/03_fireball.mp3": ("one", "F:soundfx/powers/fireball.ogg", None),
 "soundbox/04_healing.mp3": ("one", "W:sounds/heal.wav", None),
 "soundbox/05_lightning.mp3": ("one", "W:sounds/lightning.ogg", None),
 "soundbox/06_magic-missile.mp3": ("one", "W:sounds/magic-missile-1.ogg", None),
 "soundbox/07_shield-block.mp3": ("one", "F:soundfx/powers/block.ogg", None),
 "soundbox/08_arrow-hit.mp3": ("mix", ["Z:attack/weapon/arrowfly_02.ogg", "Z:attack/impact/arrow_wood_02.ogg"], "[1]adelay=450:all=1[b];[0][b]amix=inputs=2:duration=longest:normalize=0[out]"),
 "soundbox/09_miss.mp3": ("one", "W:sounds/miss-2.ogg", None),
 "soundbox/10_explosion.mp3": ("one", "F:soundfx/powers/quake.ogg", None),
 "soundbox/11_gold-coins.mp3": ("one", "W:sounds/gold.ogg", None),
 "soundbox/12_drink-a-potion.mp3": ("one", "W:sounds/potion.ogg", None),
 "soundbox/13_teleport.mp3": ("one", "F:soundfx/powers/teleport.ogg", None),
 "soundbox/14_trap-spikes.mp3": ("one", "F:soundfx/powers/spikes.ogg", None),
 "soundbox/15_dragon-roar.mp3": ("one", "W:sounds/drake-die.ogg", None),
 "soundbox/16_evil-laugh.mp3": ("one", "WC:World_Conquest/sounds/witches-laugh.wav", None),
 "soundbox/17_creaking-door.mp3": ("one", "WC:The_Deceivers_Gambit/sounds/door-close.wav", None),
 "soundbox/18_fanfare.mp3": ("one", "Z:interface/alarm/alarmvictory_1.ogg", None),
}

# Short one-shots repeated into a longer event: dest -> (times, gap seconds)
REPEAT = {
 "forest/4-the-human-village/events/02_horse-passes.mp3": (5, 0.0),
 "big-war/1-the-soldier-training-camp/events/04_cavalry-gallop.mp3": (7, 0.0),
 "big-war/2-let-the-army-walk/events/02_siege-engines-roll.mp3": (4, 0.0),
 "big-war/2-let-the-army-walk/events/03_supply-carts.mp3": (4, 0.0),
 "forest/4-the-human-village/events/03_dog-barks.mp3": (3, 0.35),
 "forest/2-fight-with-a-bear/events/02_bear-growl.mp3": (2, 0.15),
}
# Ambience shorter than this is extended with crossfades so it loops smoothly
MIN_LOOP = 30
NO_XFADE = {"forest/2-fight-with-a-bear/ambience/01_heartbeat.mp3"}
