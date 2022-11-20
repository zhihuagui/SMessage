cmake_minimum_required(VERSION 2.8.12 FATAL_ERROR)

project(compressLib C CXX ASM)

set(CMAKE_CXX_STANDARD 20)

set(ZSTD_LIBDIR thirdparty/zstd/lib)

# Define library directory, where sources and header files are located
include_directories(${ZSTD_LIBDIR} ${ZSTD_LIBDIR}/common)

file(GLOB CommonSources ${ZSTD_LIBDIR}/common/*.c)
file(GLOB CompressSources ${ZSTD_LIBDIR}/compress/*.c)
if (MSVC)
    file(GLOB DecompressSources ${ZSTD_LIBDIR}/decompress/*.c)
    add_compile_options(-DZSTD_DISABLE_ASM)
else ()
    file(GLOB DecompressSources ${ZSTD_LIBDIR}/decompress/*.c ${ZSTD_LIBDIR}/decompress/*.S)
endif ()
file(GLOB DictBuilderSources ${ZSTD_LIBDIR}/dictBuilder/*.c)

set(Sources
        ${CommonSources}
        ${CompressSources}
        ${DecompressSources}
        ${DictBuilderSources})

file(GLOB CommonHeaders ${ZSTD_LIBDIR}/common/*.h)
file(GLOB CompressHeaders ${ZSTD_LIBDIR}/compress/*.h)
file(GLOB DecompressHeaders ${ZSTD_LIBDIR}/decompress/*.h)
file(GLOB DictBuilderHeaders ${ZSTD_LIBDIR}/dictBuilder/*.h)

set(Headers
        ${ZSTD_LIBDIR}/zstd.h
        ${CommonHeaders}
        ${CompressHeaders}
        ${DecompressHeaders}
        ${DictBuilderHeaders})


set(ZLIB_DIR thirdparty/zlib-1.2.11)

#
# Check for unistd.h
#
include(CheckIncludeFile)
CHECK_INCLUDE_FILE(unistd.h Z_HAVE_UNISTD_H)
configure_file(${ZLIB_DIR}/zconf.h.cmakein ${CMAKE_CURRENT_BINARY_DIR}/zlib/zconf.h @ONLY)
include_directories(${ZLIB_DIR} ${CMAKE_CURRENT_BINARY_DIR}/zlib)
set(ZLIB_SRCS
    ${ZLIB_DIR}/adler32.c
    ${ZLIB_DIR}/compress.c
    ${ZLIB_DIR}/crc32.c
    ${ZLIB_DIR}/deflate.c
    ${ZLIB_DIR}/gzclose.c
    ${ZLIB_DIR}/gzlib.c
    ${ZLIB_DIR}/gzread.c
    ${ZLIB_DIR}/gzwrite.c
    ${ZLIB_DIR}/inflate.c
    ${ZLIB_DIR}/infback.c
    ${ZLIB_DIR}/inftrees.c
    ${ZLIB_DIR}/inffast.c
    ${ZLIB_DIR}/trees.c
    ${ZLIB_DIR}/uncompr.c
    ${ZLIB_DIR}/zutil.c
)

file(GLOB LubanCompSRCS src/lubanCompress/*.cpp)

if (EMSCRIPTEN)
    add_definitions("-DEMSCRIPTEN")
    add_compile_options(-O3 -Wno-deprecated-non-prototype)

# -sIMPORTED_MEMORY=1
    add_link_options(-sALLOW_MEMORY_GROWTH=1 -sWASM=1 -sEXPORT_ES6=1 -O3 -sMODULARIZE=1 -sERROR_ON_UNDEFINED_SYMBOLS=0 -s ENVIRONMENT='web')
    add_executable(zstdWeb ${Sources} ${ZLIB_SRCS} ${LubanCompSRCS} src/zstdweb.cpp)

else()

    add_library(compressLib STATIC ${Sources} ${ZLIB_SRCS} ${LubanCompSRCS})
    add_executable(recompress src/zstdmain.cpp)
    target_link_libraries(recompress PRIVATE compressLib)
    add_executable(compTest src/zstdtest.cpp)
    target_link_libraries(compTest PRIVATE compressLib)

endif()
