cmake_minimum_required(VERSION 2.8.12 FATAL_ERROR)

project(compressLib C ASM CXX)

set(CMAKE_CXX_STANDARD 20)

set(LIBRARY_DIR zstd/lib)

# Define library directory, where sources and header files are located
include_directories(${LIBRARY_DIR} ${LIBRARY_DIR}/common)

file(GLOB CommonSources ${LIBRARY_DIR}/common/*.c)
file(GLOB CompressSources ${LIBRARY_DIR}/compress/*.c)
if (MSVC)
    file(GLOB DecompressSources ${LIBRARY_DIR}/decompress/*.c)
    add_compile_options(-DZSTD_DISABLE_ASM)
else ()
    file(GLOB DecompressSources ${LIBRARY_DIR}/decompress/*.c ${LIBRARY_DIR}/decompress/*.S)
endif ()
file(GLOB DictBuilderSources ${LIBRARY_DIR}/dictBuilder/*.c)

set(Sources
        ${CommonSources}
        ${CompressSources}
        ${DecompressSources}
        ${DictBuilderSources})

file(GLOB CommonHeaders ${LIBRARY_DIR}/common/*.h)
file(GLOB CompressHeaders ${LIBRARY_DIR}/compress/*.h)
file(GLOB DecompressHeaders ${LIBRARY_DIR}/decompress/*.h)
file(GLOB DictBuilderHeaders ${LIBRARY_DIR}/dictBuilder/*.h)

set(Headers
        ${LIBRARY_DIR}/zstd.h
        ${CommonHeaders}
        ${CompressHeaders}
        ${DecompressHeaders}
        ${DictBuilderHeaders})

set(ZLIB_DIR zlib)

include_directories(zlib)
set(ZLIB_SRCS
    zlib/adler32.c
    zlib/compress.c
    zlib/crc32.c
    zlib/deflate.c
    zlib/gzclose.c
    zlib/gzlib.c
    zlib/gzread.c
    zlib/gzwrite.c
    zlib/inflate.c
    zlib/infback.c
    zlib/inftrees.c
    zlib/inffast.c
    zlib/trees.c
    zlib/uncompr.c
    zlib/zutil.c
)

file(GLOB LubanCompSRCS src/lubanCompress/*.cpp)

if (EMSCRIPTEN)
    add_compile_options(-O3)

# -sIMPORTED_MEMORY=1
    add_link_options(-sALLOW_MEMORY_GROWTH=1 -sWASM=1 -O3 -sMODULARIZE=1 -sERROR_ON_UNDEFINED_SYMBOLS=0 -s ENVIRONMENT='web')
    add_executable(zstdWeb ${Sources} ${ZLIB_SRCS} ${LubanCompSRCS} src/zstdweb.cpp)

else()

    add_library(compressLib STATIC ${Sources} ${ZLIB_SRCS} ${LubanCompSRCS})
    add_executable(recompress src/zstdmain.cpp)
    target_link_libraries(recompress PRIVATE compressLib)
    add_executable(compTest src/zstdtest.cpp)
    target_link_libraries(compTest PRIVATE compressLib)

endif()
