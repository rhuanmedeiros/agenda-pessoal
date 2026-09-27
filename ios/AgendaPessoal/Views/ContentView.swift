import SwiftUI

struct ContentView: View {
    var body: some View {
        ZStack {
            // Background to avoid any seams
            Color(red: 20/255.0, green: 26/255.0, blue: 27/255.0)
                .ignoresSafeArea()
            
            WebViewContainer()
                .ignoresSafeArea()
        }
    }
}

#Preview {
    ContentView()
}
