cmake_minimum_required(VERSION 3.20.0)

project(dephy_ml_high_speed_implement C)

add_library(dephy_ml_high_speed_implement STATIC
  src/bitmap_anim.c
)

target_include_directories(dephy_ml_high_speed_implement PUBLIC include)

